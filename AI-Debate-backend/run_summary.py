import sys
import json
import re
import time
from requests.exceptions import SSLError, ChunkedEncodingError
from langchain_openai import ChatOpenAI
from langchain_community.tools.arxiv.tool import ArxivQueryRun
from dotenv import load_dotenv
import os

load_dotenv()  # 加载 .env 文件到环境变量

sys.stdout.reconfigure(encoding='utf-8')

ROLE_PROFILES = {
    "环保主义者": {
        "english_name": "The Environmentalist",
        "keywords": "sustainability OR ecological protection OR carbon neutrality OR green energy",
        "style": "富有情感，强调对未来后代的责任，引用环境研究报告"
    },
    "政策制定者": {
        "english_name": "The Policy Maker",
        "keywords": "social equity OR legal framework OR administrative feasibility OR public responsibility",
        "style": "理性严谨，关注政策执行与成本效益平衡"
    },
    "经济学家": {
        "english_name": "The Economist",
        "keywords": "market mechanisms OR cost-benefit analysis OR economic growth OR incentive structures",
        "style": "数据驱动，引用模型与历史案例，强调效率优先"
    },
    "技术乐观主义者": {
        "english_name": "The Tech Optimist",
        "keywords": "technological solutions OR artificial intelligence OR clean technology OR innovation-driven",
        "style": "乐观积极，强调技术突破带来的变革潜力"
    },
    "哲学评论者": {
        "english_name": "The Philosopher",
        "keywords": "moral responsibility OR intergenerational justice OR anthropocentrism OR value conflicts",
        "style": "抽象、反思性强，经常提出问题挑战他人假设"
    }
}

class SummaryGenerator:
    def __init__(self, role):
        self.role = role
        self.llm = ChatOpenAI(
            temperature=0.3,  # 降低温度以获得更稳定的总结
            model="gpt-4o-mini",
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_API_BASE") 
        )
        self.retriever = ArxivQueryRun()
        self.role_profile = ROLE_PROFILES.get(role, ROLE_PROFILES["环保主义者"])

    def translate(self, text):
        prompt = f"请将以下中文翻译成用于学术检索的自然英文：\n\n{text}"
        return self.llm.invoke(prompt).content.strip()

    def arxiv_search(self, topic):
        query = f"{topic} {self.role_profile['keywords']} sortBy:submittedDate max_results:3"  # 减少检索数量
        for i in range(3):
            try:
                return self.retriever.run(query)
            except Exception:
                time.sleep(2 ** i)
        return ""

    def parse_titles(self, raw_text):
        titles = []
        papers = re.split(r"Published:\s", raw_text)[1:]
        for p in papers:
            m = re.search(r"Title:\s(.+)", p)
            if m:
                titles.append(m.group(1).strip())
        return titles

    def generate_summary(self, topic, all_previous_json):
        # 处理 topic 与发言内容
        if any('\u4e00' <= c <= '\u9fff' for c in topic):
            topic_en = self.translate(topic)
        else:
            topic_en = topic

        raw_papers = self.arxiv_search(topic_en)
        references = self.parse_titles(raw_papers)

        all_statements = json.loads(all_previous_json)
        self_statements = [s["text"] for s in all_statements if s["name"] == self.role]
        others_statements = [f"{s['name']}：{s['text']}" for s in all_statements if s["name"] != self.role]

        self_history = "\n".join(self_statements) or "（你在前几轮尚未发言）"
        others_history = "\n".join(others_statements) or "（尚无其他发言）"

        prompt = f"""你是一位名为「{self.role}」的智能体，已经参与了关于"「{topic}」"的多轮辩论。现在是总结阶段，请完成以下任务：

1. 回顾你在前几轮的立场和主要观点
2. 分析其他智能体的核心论点及其变化
3. 从你的角色视角({self.role_profile['style']})总结讨论
4. 提出建设性的综合建议或未来方向

你的角色风格是：「{self.role_profile['style']}」

--- 你在前几轮的发言：
{self_history}

--- 其他智能体的发言：
{others_history}

--- arXiv 检索摘要（可选参考）：
{raw_papers}

请输出一个结构化的总结，包含以下部分：
1. 立场重申
2. 讨论要点回顾
3. 对他人观点的评价
4. 综合建议

输出格式如下：
{{
  "agent": "{self.role}",
  "summary": "你的总结性发言",
  "key_points": ["要点1", "要点2", "要点3"],
  "references": {json.dumps(references, ensure_ascii=False)}
}}
"""

        response = self.llm.invoke(prompt)
        return response.content.strip()

if __name__ == "__main__":
    try:
        topic = sys.argv[1]
        role = sys.argv[2]
        previous_json = sys.argv[3]  # JSON string: [{"name": "...", "text": "..."}, ...]

        agent = SummaryGenerator(role)
        result = agent.generate_summary(topic, previous_json)
        print(result)
    except Exception as e:
        print(f"总结生成错误: {str(e)}", file=sys.stderr)
        sys.exit(1)