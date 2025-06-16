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


class FinalSummarizer:
    def __init__(self):
        self.llm = ChatOpenAI(
            temperature=0.2,
            model="gpt-4o-mini",
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_API_BASE") 
        )

        self.retriever = ArxivQueryRun()
        self.summarizer_name = "总结者"
        self.summarizer_style = "客观中立，全面综合各方观点，注重逻辑一致性，强调建设性解决方案"

    def translate(self, text):
        prompt = f"请将以下中文翻译成用于学术检索的自然英文：\n\n{text}"
        return self.llm.invoke(prompt).content.strip()

    def arxiv_search(self, topic):
        query = f"{topic} sortBy:submittedDate max_results:3"
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

    def generate_final_conclusion(self, input_data):
        # 确保输入数据格式正确
        if isinstance(input_data, str):
            try:
                input_data = json.loads(input_data)
            except json.JSONDecodeError:
                raise ValueError("输入数据不是有效的JSON格式")
        
        if not isinstance(input_data, dict):
            raise ValueError("输入数据必须是字典类型")
        
        topic = input_data.get('topic', '')
        summaries = input_data.get('summaries', [])
        
        if not topic or not isinstance(summaries, list):
            raise ValueError("缺少必要的topic或summaries字段")

        # 处理 topic 与发言内容
        if any('\u4e00' <= c <= '\u9fff' for c in topic):
            topic_en = self.translate(topic)
        else:
            topic_en = topic

        raw_papers = self.arxiv_search(topic_en)
        references = self.parse_titles(raw_papers)

        summaries_by_role = {s['name']: s['text'] for s in summaries}

        prompt = f"""你是一位名为「{self.summarizer_name}」的智能体，负责对关于"「{topic}」"的辩论进行最终总结。请完成以下任务：

1. 分析各方在总结阶段的核心观点
2. 识别辩论中的关键共识与分歧点
3. 从客观中立的角度评估各方论点的合理性
4. 提出建设性的综合解决方案或未来方向

你的角色风格是：「{self.summarizer_style}」

--- 各方总结发言 ---
{json.dumps(summaries_by_role, indent=2, ensure_ascii=False)}

--- arXiv 检索摘要（可选参考） ---
{raw_papers}

请输出一个结构化的最终结论，包含以下部分：
1. 辩论概述
2. 核心共识与分歧
3. 各方观点评价
4. 综合建议与未来方向

输出格式如下：
{{
  "summarizer": "{self.summarizer_name}",
  "conclusion": "你的最终结论",
  "key_points": ["要点1", "要点2", "要点3"],
  "references": {json.dumps(references, ensure_ascii=False)}
}}
"""

        response = self.llm.invoke(prompt)
        try:
            return json.loads(response.content.strip())
        except json.JSONDecodeError:
            raise ValueError("AI返回的数据不是有效的JSON格式")

if __name__ == "__main__":
    try:
        # 获取完整的输入JSON
        input_json = sys.argv[1]
        
        summarizer = FinalSummarizer()
        result = summarizer.generate_final_conclusion(input_json)
        
        # 确保输出是有效的JSON
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "error": True,
            "message": f"最终总结生成错误: {str(e)}"
        }))
        sys.exit(1)