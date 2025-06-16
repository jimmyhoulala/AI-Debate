# 启动方法
## 环境安装
在 **/AI-Debate-backend** 文件夹下输入
```bash
npm install express
npm install cors
npm install mysql2
npm install dotenv
```
一些运行脚本的python库没有一一列出，可以查看代码下载需要的python库。

在 **/AI-Debate-frontend** 下输入
```bash
npm install 
```

## 启动
先在 **/AI-Debate-backend/.env** 中完成数据库以及API的设置
```
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=

OPENAI_API_KEY=
OPENAI_API_BASE=
```

然后在 **/AI-Debate-backend** 下先运行后端：
```bash
node app.js
```

然后在 **/AI-Debate-frontend** 下运行前端：
```bash
npm run dev
```


