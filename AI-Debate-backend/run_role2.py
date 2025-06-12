import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import re
import time
from requests.exceptions import SSLError, ChunkedEncodingError
from langchain_openai import ChatOpenAI
from langchain_community.tools.arxiv.tool import ArxivQueryRun

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

class DynamicRAG:
    def __init__(self, llm=None, role="政策制定者"):
        self.llm = llm or ChatOpenAI(
            temperature=0.2,
            model="gpt-4o-mini",
            openai_api_key="sk-zk2c86662738a05b2a08eecd7c930008994682586cf9e781",
            base_url="https://api.zhizengzeng.com/v1"
        )
        self.retriever = ArxivQueryRun()
        self.role = role if role in ROLE_PROFILES else "政策制定者"
        self.role_profile = ROLE_PROFILES[self.role]

    def is_chinese(self, text: str) -> bool:
        return any('\u4e00' <= c <= '\u9fff' for c in text)

    def translate_to_english(self, chinese_text: str) -> str:
        prompt = f"请将以下中文主题翻译成自然流畅的英文，用于学术论文检索：\n\n{chinese_text}"
        response = self.llm.invoke(prompt)
        return response.content.strip()

    def arxiv_search(self, topic: str) -> str:
        query = f"{topic} {self.role_profile['keywords']} sortBy:submittedDate max_results:5"
        max_retries = 3
        for attempt in range(max_retries):
            try:
                return self.retriever.run(query)
            except (SSLError, ChunkedEncodingError) as e:
                print(f"arXiv API 请求失败，尝试重试 {attempt+1}/{max_retries}: {e}")
                time.sleep(2 ** attempt)
        raise RuntimeError("arXiv API 请求失败，超过最大重试次数")

    def parse_arxiv_results(self, raw_text: str):
        papers = re.split(r"Published:\s", raw_text)[1:]
        results = []
        for paper in papers:
            try:
                date_match = re.match(r"(\d{4}-\d{2}-\d{2})", paper)
                published = date_match.group(1) if date_match else "Unknown"

                title_match = re.search(r"Title:\s(.+)", paper)
                title = title_match.group(1).strip() if title_match else "No title"

                authors_match = re.search(r"Authors:\s(.+)", paper)
                authors = authors_match.group(1).strip() if authors_match else "Unknown authors"

                results.append({
                    "title": title,
                    "authors": authors,
                    "published": published,
                    "source": "arXiv"
                })
            except Exception:
                continue
        return results

    def get_evidence(self, topic: str) -> dict:
        original_topic = topic
        if self.is_chinese(topic):
            topic = self.translate_to_english(topic)

        raw_papers = self.arxiv_search(topic)
        metadata_list = self.parse_arxiv_results(raw_papers)

        prompt = f"""你是一位{self.role}，你的发言风格是：{self.role_profile['style']}。

请基于以下学术论文摘要，严格从{self.role}的立场和关注点出发（请强调关键词：{self.role_profile['keywords']}），用中文总结该主题的主要观点，并结合该立场做出独立的结论和评论。

主题: {original_topic}

论文摘要:
{raw_papers}

请回答时务必体现你的角色立场，强调你的核心关注点。

请按照以下格式回答：
结论: <用中文写下你的结论>

参考文献:
- <论文标题1>
- <论文标题2>
"""

        response = self.llm.invoke(prompt)
        conclusion = response.content.strip().split("参考文献")[0].replace("结论:", "").strip()

        return {
            "conclusion": conclusion,
            "references": metadata_list
        }


if __name__ == "__main__":
    try:
        topic = sys.argv[1]
        role = sys.argv[2] if len(sys.argv) > 2 else "环保主义者"
        rag = DynamicRAG(role=role)
        result = rag.get_evidence(topic)
        print(json.dumps(result, ensure_ascii=False))  # 只输出这条
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)  # 错误信息输出到 stderr
        sys.exit(1)
