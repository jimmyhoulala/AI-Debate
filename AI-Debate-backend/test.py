from langchain_openai import ChatOpenAI
from langchain_community.tools.arxiv.tool import ArxivQueryRun
import re
import json


class DynamicRAG:
    def __init__(self, llm=None):
        self.llm = llm or ChatOpenAI(
            temperature=0.2,
            model="gpt-4o-mini",
            openai_api_key="sk-zk2c86662738a05b2a08eecd7c930008994682586cf9e781",
            base_url="https://api.zhizengzeng.com/v1"
        )
        self.retriever = ArxivQueryRun()

    def parse_arxiv_results(self, raw_text: str):
        # 分割成每篇论文
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
            except Exception as e:
                print(f"Error parsing paper: {e}")
                continue

        return results

    def get_evidence(self, topic: str) -> dict:
        query = f"{topic}"
        raw_papers = self.retriever.run(query)
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

        # 拆分总结
        parts = response.content.strip().split("References:")
        conclusion = parts[0].replace("Conclusion:", "").strip()

        return {
            "conclusion": conclusion,
            "references": metadata_list
        }


if __name__ == "__main__":
    rag = DynamicRAG()
    topic = "Trump's tax plan"
    result = rag.get_evidence(topic)

    print("🔍 分析结果：\n")
    print("🧠 Conclusion:\n" + result["conclusion"])
    print("\n📚 References:")
    for idx, ref in enumerate(result["references"], 1):
        print(f"{idx}. {ref['title']}")
        print(f"   Authors: {ref['authors']}")
        print(f"   Published: {ref['published']}")
        print(f"   Source: {ref['source']}\n")
