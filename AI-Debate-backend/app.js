// server/app.js
const express = require("express");
const cors = require("cors");               // 新增 cors
const { exec } = require("child_process");

const app = express();
const PORT = 3000;

// 允许跨域请求，默认允许所有来源
app.use(cors());

app.use(express.json());  // 用express自带json解析，替代body-parser

app.post("/api/analyze", (req, res) => {
    const topic = req.body.topic;
    if (!topic) {
        return res.status(400).json({ error: "No topic provided" });
    }

    // 调用 Python 脚本，确保你的 Python 脚本能正确接收参数并输出 JSON
    exec(`python run_rag.py "${topic}"`, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Error:", stderr);
            return res.status(500).json({ error: "Python execution failed" });
        }
        try {
            const result = JSON.parse(stdout);
            return res.json(result);
        } catch (e) {
            console.error("❌ JSON parse error:", e);
            return res.status(500).json({ error: "Invalid JSON output from Python script" });
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
