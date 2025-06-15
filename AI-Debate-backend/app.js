// server/app.js
const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const mysql = require("mysql2/promise");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// 创建数据库连接池
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "123456", // 请替换为你的 MySQL 密码
  database: "AI-Debate",
});

// // Helper 函数：执行 Python 脚本
// function runPython(script, args) {
//     return new Promise((resolve, reject) => {
//         const command = `python ${script} "${args.topic}" "${args.role}"`;
//         exec(command, { cwd: __dirname }, (err, stdout, stderr) => {
//             if (err) return reject(stderr);
//             try {
//                 const result = JSON.parse(stdout);
//                 resolve(result);
//             } catch (e) {
//                 reject("Invalid JSON from Python");
//             }
//         });
//     });
// }

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


// API：执行三方辩论，并入库
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
    console.error("❌ API Error:", err);
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

// app.post("/api/debate_2", async (req, res) => {
//   const { 
//     topic, 
//     topic_id, 
//     agents,
//     current_debate_round = 1,  // 辩论轮次（1-3）
//     current_agent_index = 0    // 当前发言的智能体索引
//   } = req.body;

//   // 参数验证
//   if (!topic_id || !topic || !Array.isArray(agents)) {
//     return res.status(400).json({ error: "缺少必要参数" });
//   }

//   try {
//     console.log("=== 接收参数 ===");
//     console.log({
//       topic_id,
//       current_debate_round,
//       current_agent_index,
//       agents: agents.map(a => a.name)
//     });
//     // 1. 获取所有历史发言
//     const [rows] = await db.execute(
//       `SELECT a.name, d.conclusion AS text, d.round_id, d.utterance_index
//        FROM dialogues d JOIN agents a ON d.agent_id = a.id
//        WHERE d.topic_id = ?
//        ORDER BY d.round_id, d.utterance_index, a.order_index`,
//       [topic_id]
//     );

//     // 2. 确定当前发言的智能体
//     const agent = agents[current_agent_index];
//     if (!agent) {
//       throw new Error(`无效的智能体索引: ${current_agent_index}`);
//     }

//     // 3. 调用Python生成发言
//     const prevJson = JSON.stringify(rows);
//     const resultRaw = await new Promise((resolve, reject) => {
//       execFile(
//         "python",
//         ["run_rebuttal.py", topic, agent.name, prevJson],
//         { cwd: __dirname },
//         (err, stdout, stderr) => {
//           if (err) return reject(stderr || err.message);
//           resolve(stdout);
//         }
//       );
//     });
//     const { agent: name, utterance, references } = JSON.parse(resultRaw);

//     // 4. 存入数据库（关键修复）
//     const [[agentRow]] = await db.execute(
//       "SELECT id FROM agents WHERE topic_id = ? AND name = ?",
//       [topic_id, name]
//     );
//     const agentId = agentRow.id;

//     await db.execute(
//       `INSERT INTO dialogues (
//         topic_id, agent_id, round_id, 
//         utterance_index, conclusion, references_json
//       ) VALUES (?, ?, ?, ?, ?, ?)`,
//       [
//         topic_id,
//         agentId,
//         2,  // 固定为第二轮辩论
//         current_debate_round,  // 使用当前辩论轮次作为utterance_index
//         utterance,
//         JSON.stringify(references)
//       ]
//     );

//     // 5. 计算下一步状态（关键修复）
//     let next_agent_index = current_agent_index + 1;
//     let next_debate_round = current_debate_round;
//     let is_complete = false;

//     // 判断是否完成所有发言
//     if (next_agent_index >= agents.length) {
//       next_agent_index = 0;
//       next_debate_round++;

//       // 完成3轮后结束
//       if (next_debate_round > 3) {
//         is_complete = true;
//       }
//     }
//     console.log("=== 返回数据 ===");
//     console.log({
//       dialogue: {
//         name,
//         text: utterance.substring(0, 50) + "...", // 截取前50字符
//         references
//       },
//       next_debate_round,
//       next_agent_index,
//       is_complete
//     });
//     // 6. 返回响应
//     res.json({
//       success: true,
//       dialogue: {
//         name,
//         text: utterance,
//         references
//       },
//       next_debate_round: next_debate_round, 
//       next_agent_index: next_agent_index,
//       is_complete: is_complete
//     });

//   } catch (e) {
//     console.error("[辩论API错误]", e);
//     res.status(500).json({ 
//       error: e.message,
//       stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
//     });
//   }
// });
// 在app.js中添加以下API端点
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

    // 3. 准备输入数据（关键修改）
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



app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});