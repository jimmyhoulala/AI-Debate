# 环境依赖安装

## 后端依赖

在 `/AI-Debate-backend` 目录下执行：

```bash
npm install
npm install express
npm install cors
npm install mysql2
npm install dotenv
```

## Python 依赖

系统中的 Python 脚本位于 `AI-Debate-backend` 目录下，建议使用虚拟环境管理：

```bash
pip install openai
pip install mysql-connector-python
pip install tqdm
pip install requests
```

> 以上仅仅列出了几个需要安装的库的例子，没有全部列出。如需运行 `export_debate.py` 脚本导出内容，请确保 Python 能正常访问 MySQL，并安装 `mysql-connector-python`。

## 前端依赖

在 `/AI-Debate-frontend` 目录下执行：

```bash
npm install
```

---

# 配置环境变量

在后端目录下新建或编辑 `.env` 文件，填写以下字段：

```env
# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=ai_debate

# OpenAI API配置
OPENAI_API_KEY=your_openai_key
OPENAI_API_BASE=https://api.openai.com/v1
```

---

# 启动服务

依照以下顺序启动系统组件：

## 启动后端服务

```bash
cd AI-Debate-backend
node app.js
```

服务默认运行在：

```
http://localhost:3001
```

## 启动前端服务

```bash
cd AI-Debate-frontend
npm run dev
```

前端默认运行在：

```
http://localhost:5173
```

---

## 启动注意事项

- 请确认 `.env` 中数据库信息与 OpenAI 密钥正确；
- 数据库表结构已定义在 `AI-Debate-backend/database.sql`，可用以下命令导入：

```bash
mysql -u root -p ai_debate < database.sql
```

- Python 与 Node.js 使用的依赖较轻，但建议按模块使用虚拟环境隔离；
- 所有 Python 脚本均支持命令行调用，运行时依赖与 `app.js` 同级目录结构一致。