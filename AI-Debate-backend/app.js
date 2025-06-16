require('dotenv').config(); // 加载 .env 文件的内容到 process.env
const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const mysql = require("mysql2/promise");
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());


// 创建数据库连接池
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});



const { execFile } = require("child_process");

function runPython(script, args) {
  return new Promise((resolve, reject) => {
    execFile("python", [script, args.topic, args.role], { cwd: __dirname, encoding: "utf8" }, (err, stdout, stderr) => {
      console.log("=== Python stdout ===");
      console.log(stdout);
      console.log("=== Python stderr ===");
      console.log(stderr);

      if (err) return reject(stderr || err.message);
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        console.error("Failed to parse JSON from Python output.");
        reject("Invalid JSON from Python");
      }
    });
  });
}


// 第一阶段立论
app.post("/api/debate_1", async (req, res) => {
  const { topic, agents } = req.body;
  if (!topic || !Array.isArray(agents) || agents.length !== 3) {
    return res.status(400).json({ error: "Invalid input format" });
  }

  try {
    // 1. 插入 topic
    const [topicResult] = await db.execute(
      "INSERT INTO topics (content) VALUES (?)",
      [topic]
    );
    const topicId = topicResult.insertId;

    // 2. 插入 agents
    const agentMap = {}; // name -> id
    for (let i = 0; i < agents.length; i++) {
      const { name, order } = agents[i];
      const [agentResult] = await db.execute(
        "INSERT INTO agents (name, order_index, topic_id) VALUES (?, ?, ?)",
        [name, order, topicId]
      );
      agentMap[name] = agentResult.insertId;
    }

    // 3. 调用 3 个 Python 文件
    const scripts = ["run_role1.py", "run_role2.py", "run_role3.py"];
    const results = await Promise.all(
      scripts.map((script, i) =>
        runPython(script, { topic, role: agents[i].name })
      )
    );

    // 4. 插入对话记录
    for (let i = 0; i < results.length; i++) {
      const { conclusion, references } = results[i];
      const agentId = agentMap[agents[i].name];
      await db.execute(
        "INSERT INTO dialogues (topic_id, agent_id, round_id, utterance_index, conclusion, references_json) VALUES (?, ?, ?, ?, ?, ?)",
        [topicId, agentId, 1, 1, conclusion, JSON.stringify(references)]
      );
    }

    return res.json({ success: true, topic_id: topicId });
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 获取指定 topic 第一轮（round 1）的所有对话
app.get('/api/dialogues', async (req, res) => {
  const topicId = req.query.topic_id
  if (!topicId) return res.status(400).json({ error: '缺少 topic_id 参数' })

  try {
    const [rows] = await db.execute(
      'SELECT a.name, d.conclusion AS text, d.references_json AS `references` ' +
      'FROM dialogues d JOIN agents a ON d.agent_id = a.id ' +
      'WHERE d.topic_id = ? AND d.round_id = 1 ' +
      'ORDER BY a.order_index',
      [topicId]
    );


    const dialogue = rows.map(r => ({
      name: r.name,
      text: r.text,
      references: JSON.parse(r.references)
    }));
    res.json({ success: true, dialogue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

//第二阶段辩论
app.post("/api/debate_2", async (req, res) => {
  const { topic, topic_id, agents } = req.body;
  if (!topic_id || !topic || !Array.isArray(agents)) {
    return res.status(400).json({ error: "参数缺失" });
  }

  try {
    // 1. 从 DB 获取已有所有发言（第1轮 + 已入库的第2轮发言）
    const [rows] = await db.execute(
      `SELECT a.name, d.conclusion AS text
       FROM dialogues d JOIN agents a ON d.agent_id = a.id
       WHERE d.topic_id = ?
       ORDER BY d.round_id, a.order_index, d.utterance_index`,
      [topic_id]
    );
    const previous = rows; // {name, text}

    const inserted = [];
    for (let round = 1; round <= 3; round++) {
      for (let agent of agents) {
        // 2. 调用 Python 生成本轮发言
        const prevJson = JSON.stringify(previous);
        const resultRaw = await new Promise((resolve, reject) => {
          execFile(
            "python",
            ["run_rebuttal.py", topic, agent.name, prevJson],
            { cwd: __dirname },
            (err, stdout, stderr) => {
              if (err) return reject(stderr || err.message);
              resolve(stdout);
            }
          );
        });
        const { agent: name, utterance, references } = JSON.parse(resultRaw);

        // 3. 存入 DB
        const [[agentRow]] = await db.execute(
          "SELECT id FROM agents WHERE topic_id = ? AND name = ?",
          [topic_id, name]
        );
        const agentId = agentRow.id;

        await db.execute(
          `INSERT INTO dialogues (topic_id, agent_id, round_id, utterance_index, conclusion, references_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [topic_id, agentId, 2, round, utterance, JSON.stringify(references)]
        );

        // 更新上下文
        previous.push({ name, text: utterance });
        inserted.push({ name, text: utterance, references });
      }
    }

    res.json({ success: true, dialogues: inserted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 第三阶段各自总结
app.post("/api/debate_3", async (req, res) => {
  const { topic, topic_id, agents } = req.body;
  if (!topic_id || !topic || !Array.isArray(agents)) {
    return res.status(400).json({ error: "参数缺失" });
  }

  try {
    // 1. 从DB获取所有历史发言
    const [rows] = await db.execute(
      `SELECT a.name, d.conclusion AS text
       FROM dialogues d JOIN agents a ON d.agent_id = a.id
       WHERE d.topic_id = ?
       ORDER BY d.round_id, a.order_index, d.utterance_index`,
      [topic_id]
    );
    const previous = rows;

    // 2. 为每个agent生成总结
    const summaries = [];
    for (const agent of agents) {
      const prevJson = JSON.stringify(previous);
      const resultRaw = await new Promise((resolve, reject) => {
        execFile(
          "python",
          ["run_summary.py", topic, agent.name, prevJson],
          { cwd: __dirname, encoding: "utf8" },
          (err, stdout, stderr) => {
            if (err) return reject(stderr || err.message);
            resolve(stdout);
          }
        );
      });

      const result = JSON.parse(resultRaw);

      // 3. 存入DB (round_id=3表示总结轮)
      const [[agentRow]] = await db.execute(
        "SELECT id FROM agents WHERE topic_id = ? AND name = ?",
        [topic_id, agent.name]
      );
      const agentId = agentRow.id;

      await db.execute(
        `INSERT INTO dialogues (topic_id, agent_id, round_id, utterance_index, conclusion, references_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          topic_id,
          agentId,
          3,  // 第三轮总结
          1,  // utterance_index固定为1
          result.summary,
          JSON.stringify(result.references)
        ]
      );

      summaries.push({
        name: agent.name,
        text: result.summary,
        references: result.references,
        key_points: result.key_points
      });
    }

    res.json({ success: true, summaries });
  } catch (e) {
    console.error("[总结API错误]", e);
    res.status(500).json({
      error: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
});


//最后阶段由主持人格鲁最终总结
app.post("/api/debate_4", async (req, res) => {
  const { topic, topic_id, agents } = req.body;
  if (!topic_id || !topic || !Array.isArray(agents)) {
    return res.status(400).json({ error: "参数缺失" });
  }

  try {
    // 1. 检查并插入总结者Agent
    let summarizerId;
    const [[existingSummarizer]] = await db.execute(
      "SELECT id FROM agents WHERE topic_id = ? AND name = ?",
      [topic_id, "总结者"]
    );

    if (existingSummarizer) {
      summarizerId = existingSummarizer.id;
    } else {
      const [result] = await db.execute(
        "INSERT INTO agents (name, order_index, topic_id) VALUES (?, ?, ?)",
        ["总结者", 4, topic_id]
      );
      summarizerId = result.insertId;
    }

    // 2. 获取第三轮总结
    const [summaryRows] = await db.execute(
      `SELECT a.name, d.conclusion AS text, d.references_json
       FROM dialogues d JOIN agents a ON d.agent_id = a.id
       WHERE d.topic_id = ? AND d.round_id = 3
       ORDER BY a.order_index`,
      [topic_id]
    );

    // 3. 准备输入数据
    const inputData = {
      topic: topic,
      summaries: summaryRows.map(r => ({
        name: r.name,
        text: r.text,
        references: JSON.parse(r.references_json || '[]')
      }))
    };

    // 4. 调用Python脚本（传递JSON字符串）
    const resultRaw = await new Promise((resolve, reject) => {
      execFile(
        "python",
        ["run_final_conclusion.py", JSON.stringify(inputData)],
        { cwd: __dirname, encoding: "utf8" },
        (err, stdout, stderr) => {
          console.log("Python输出:", stdout);
          console.log("Python错误:（显示为空即无错误）", stderr);
          if (err) return reject(stderr || err.message);
          resolve(stdout);
        }
      );
    });

    // 5. 解析Python返回结果
    const result = JSON.parse(resultRaw);
    if (!result.conclusion) throw new Error("Python脚本返回无效数据");

    // 6. 存入数据库
    await db.execute(
      `INSERT INTO dialogues (
        topic_id, agent_id, round_id, 
        utterance_index, conclusion, references_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        topic_id,
        summarizerId,
        4,  // 第四轮最终总结
        1,  // utterance_index固定为1
        result.conclusion,
        JSON.stringify(result.references || [])
      ]
    );

    res.json({
      success: true,
      conclusion: result.conclusion,
      references: result.references || [],
      key_points: result.key_points || []
    });

  } catch (e) {
    console.error("[最终总结API错误]", e);
    res.status(500).json({
      error: `最终总结生成失败: ${e.message}`,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
});

//导出辩论结果
app.get('/api/export-latest', (req, res) => {
  const scriptPath = path.join(__dirname, 'export_debate.py');
  const outputDir = path.join(__dirname, 'exports');
  const zipPath = path.join(__dirname, 'debate_export.zip');

  // 执行 Python 脚本
  exec(`python ${scriptPath} --host ${process.env.DB_HOST} --user ${process.env.DB_USER} --password ${process.env.DB_PASSWORD} --database ${process.env.DB_NAME} --out-dir ${outputDir}`, (err, stdout, stderr) => {
    if (err) {
      console.error('导出失败:', stderr);
      return res.status(500).send('导出失败');
    }

    // 使用 archiver 创建 zip 文件
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.download(zipPath, 'debate_export.zip', (downloadErr) => {
        if (downloadErr) {
          console.error('下载失败:', downloadErr);
        }
        fs.rmSync(zipPath, { force: true });
        fs.rmSync(outputDir, { recursive: true, force: true });
      });
    });

    archive.on('error', err => {
      console.error('压缩失败:', err);
      res.status(500).send('压缩失败');
    });

    archive.pipe(output);
    archive.directory(outputDir, false);
    archive.finalize();
  });
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});