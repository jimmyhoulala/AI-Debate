import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
from langchain_openai import ChatOpenAI
from langchain_community.tools.arxiv.tool import ArxivQueryRun
import re
from dotenv import load_dotenv
import os

load_dotenv()  # 加载 .env 文件到环境变量

class DynamicRAG:
    def __init__(self, llm=None):
        self.llm = ChatOpenAI(
            temperature=0.2,
            model="gpt-4o-mini",
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_API_BASE")
        )

        self.retriever = ArxivQueryRun()

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
        raw_papers = self.retriever.run(topic)
        metadata_list = self.parse_arxiv_results(raw_papers)

        prompt = f"""你是一位政策分析师。请基于以下学术论文摘要，用中文总结该主题的主要观点并得出结论。

主题: {topic}

论文摘要:
{raw_papers}

请按照以下格式回答：
结论: <用中文写下你的结论>

参考文献:
- <论文标题1>
- <论文标题2>
"""
        response = self.llm.invoke(prompt)
        parts = response.content.strip().split("References:")
        conclusion = parts[0].replace("Conclusion:", "").replace("结论:", "").strip()

        return {
            "conclusion": conclusion,
            "references": metadata_list
        }

if __name__ == "__main__":
    topic = sys.argv[1]  # 从命令行读取辩题
    rag = DynamicRAG()
    result = rag.get_evidence(topic)
    print(json.dumps(result, ensure_ascii=False))
