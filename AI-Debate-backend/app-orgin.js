// // server/app.js
// const express = require("express");
// const cors = require("cors");               // 新增 cors
// const { exec } = require("child_process");

// const app = express();
// const PORT = 3000;

// // 允许跨域请求，默认允许所有来源
// app.use(cors());

// app.use(express.json());  // 用express自带json解析，替代body-parser

// app.post("/api/analyze", (req, res) => {
//     const topic = req.body.topic;
//     if (!topic) {
//         return res.status(400).json({ error: "No topic provided" });
//     }

//     // 调用 Python 脚本，确保你的 Python 脚本能正确接收参数并输出 JSON
//     exec(`python run_rag.py "${topic}"`, { cwd: __dirname }, (error, stdout, stderr) => {
//         if (error) {
//             console.error("❌ Error:", stderr);
//             return res.status(500).json({ error: "Python execution failed" });
//         }
//         try {
//             const result = JSON.parse(stdout);
//             return res.json(result);
//         } catch (e) {
//             console.error("❌ JSON parse error:", e);
//             return res.status(500).json({ error: "Invalid JSON output from Python script" });
//         }
//     });
// });

// app.listen(PORT, () => {
//     console.log(`🚀 Server running at http://localhost:${PORT}`);
// });

const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const mysql = require('mysql2/promise')

const app = express()
const PORT = 3001

app.use(cors())
app.use(bodyParser.json())

// 数据库连接配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '557177Hou',
  database: 'AI-Debate',
}

// POST /api/topic - 存储用户输入的辩题
app.post('/api/topic', async (req, res) => {
  const { topic } = req.body
  if (!topic || topic.trim() === '') {
    return res.status(400).json({ error: '辩题内容不能为空' })
  }

  try {
    const connection = await mysql.createConnection(dbConfig)
    const [result] = await connection.execute('INSERT INTO topics (content) VALUES (?)', [topic])
    await connection.end()

    res.status(200).json({ success: true, topicId: result.insertId })
  } catch (error) {
    console.error('数据库插入失败:', error)
    res.status(500).json({ error: '数据库错误' })
  }
})

// POST /api/agents - 存储与某个 topic 关联的所有 Agent
app.post('/api/agents', async (req, res) => {
  const { topic_id, agents } = req.body

  if (!topic_id || !Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ error: '缺少 topic_id 或 agents 数据' })
  }

  try {
    const connection = await mysql.createConnection(dbConfig)

    for (const agent of agents) {
      const { name, order_index } = agent
      if (!name || typeof order_index !== 'number') continue

      await connection.execute(
        'INSERT INTO agents (topic_id, name, order_index) VALUES (?, ?, ?)',
        [topic_id, name, order_index]
      )
    }

    await connection.end()
    res.json({ success: true, count: agents.length })
  } catch (error) {
    console.error('插入 agents 时出错：', error)
    res.status(500).json({ error: '数据库错误' })
  }
})



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})


