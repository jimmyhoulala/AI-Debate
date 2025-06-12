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
    password: "557177Hou",
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



app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
