-- ========================================
-- AI智能体辩论系统数据库结构定义（MySQL 版）
-- 所有 ID 字段为自增主键
-- ========================================

-- 1. 辩题表：记录每个辩题内容
CREATE TABLE topics (
    id INT AUTO_INCREMENT PRIMARY KEY,     -- 自增主键，辩题 ID
    content TEXT NOT NULL                  -- 辩题文本内容
);

-- 2. Agent 表：记录每个智能体的信息（角色、发言顺序）
CREATE TABLE agents (
    id INT AUTO_INCREMENT PRIMARY KEY,     -- 自增主键，Agent 唯一 ID
    topic_id INT NOT NULL,                 -- 外键，关联 topics(id)
    name VARCHAR(255) NOT NULL,            -- Agent 预设角色名（如“正方一辩”）
    order_index INT NOT NULL,              -- 发言顺序（从 1 开始）

    FOREIGN KEY (topic_id) REFERENCES topics(id)
);

-- 3. 对话表：记录每一句发言及其元数据
CREATE TABLE dialogues (
    id INT AUTO_INCREMENT PRIMARY KEY,     -- 自增主键，对话 ID
    topic_id INT NOT NULL,                 -- 外键，关联 topics(id)
    agent_id INT NOT NULL,                 -- 外键，关联 agents(id)
    round_id INT NOT NULL,                 -- 发言轮次（第几轮）
    utterance_index INT NOT NULL,          -- 当前轮的第几句话
    conclusion TEXT,                       -- 本句的结论或要点
    references_json TEXT,                  -- JSON 字符串格式的参考文献列表

    -- 外键约束定义
    FOREIGN KEY (topic_id) REFERENCES topics(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);
