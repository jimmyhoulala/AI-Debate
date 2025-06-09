import os
from dotenv import load_dotenv

def load_model_configs():
    """加载模型配置"""
    load_dotenv()
    configs = []
    for i in range(1, 4):
        configs.append({
            'name': os.getenv(f'MODEL{i}_NAME'),
            'base_url': os.getenv(f'MODEL{i}_BASE_URL'),
            'api_key': os.getenv(f'MODEL{i}_API_KEY')
        })
    return configs