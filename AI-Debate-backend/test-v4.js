// test-v4.js
const { execFile } = require("child_process");
const mysql = require("mysql2/promise");

// 使用相同的数据库配置
const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "No2022051106",
    database: "AI-Debate",
});

// 从原始app.js中提取的debate_4函数
async function debate4Handler({ topic, topic_id, agents }) {
    if (!topic_id || !topic || !Array.isArray(agents)) {
        throw new Error("参数缺失");
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

        // 4. 调用Python脚本
        const resultRaw = await new Promise((resolve, reject) => {
            execFile(
                "python",
                ["run_final_conclusion.py", JSON.stringify(inputData)],
                { cwd: __dirname, encoding: "utf8" },
                (err, stdout, stderr) => {
                    console.log("Python输出:", stdout);
                    console.log("Python错误:", stderr);
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
                4,
                1,
                result.conclusion,
                JSON.stringify(result.references || [])
            ]
        );

        return {
            success: true,
            conclusion: result.conclusion,
            references: result.references || [],
            key_points: result.key_points || []
        };

    } catch (e) {
        console.error("[最终总结API错误]", e);
        return {
            error: `最终总结生成失败: ${e.message}`,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        };
    }
}

// 测试用例
async function runTests() {
    try {
        console.log("🚀 开始测试第四轮最终总结...");

        // 测试数据 - 请替换为您的实际topic_id
        const testData = {
            topic: "是否应该全面禁止燃油车销售",
            topic_id: 1, // 替换为您数据库中存在的topic_id
            agents: [
                { name: "环保主义者" },
                { name: "政策制定者" },
                { name: "经济学家" }
            ]
        };

        console.log("1. 测试正常情况...");
        const result = await debate4Handler(testData);
        if (result.error) {
            throw new Error(result.error);
        }
        console.log("✅ 测试成功 - 结果:", {
            conclusion: result.conclusion.substring(0, 50) + "...",
            key_points: result.key_points
        });

        console.log("2. 测试参数缺失...");
        try {
            await debate4Handler({ topic: "测试", agents: [] });
            console.log("❌ 测试失败 - 应该抛出参数缺失错误");
        } catch (e) {
            console.log("✅ 测试成功 - 正确捕获错误:", e.message);
        }

        console.log("🎉 所有测试完成");
    } catch (error) {
        console.error("❌ 测试失败:", error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        await db.end();
        process.exit();
    }
}

// 运行测试
runTests();