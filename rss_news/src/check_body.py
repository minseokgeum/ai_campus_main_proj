from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = "여기에_기사_URL을_붙여넣으세요"

response = requests.get(
    URL,
    headers={"User-Agent": "RSSNewsResearch/1.0"},
    timeout=30,
)

print("접속 상태:", response.status_code)
response.raise_for_status()

soup = BeautifulSoup(response.content, "html.parser")

# 일반적인 기사 영역을 찾습니다.
article = soup.select_one("article")

if article is None:
    print("article 영역을 찾지 못했습니다.")
else:
    # 화면 구성용 요소를 제거합니다.
    for tag in article.select("script, style, nav, aside"):
        tag.decompose()

    paragraphs = [
        tag.get_text(" ", strip=True)
        for tag in article.select("h1, h2, h3, p, li, blockquote")
    ]
    text = "\n\n".join(p for p in paragraphs if p)

    output_dir = Path(__file__).resolve().parents[1] / "outputs" / "manual_check"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / "article_body.txt"
    output_file.write_text(text, encoding="utf-8")

    print("본문 후보 글자 수:", len(text))
    print("저장 위치:", output_file)