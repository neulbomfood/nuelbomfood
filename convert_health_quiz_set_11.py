import json

# 원본 파일명과 변환 파일명
input_file = 'health_quiz_set_11.json'
output_file = 'health_quiz_set_11_converted.json'

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

converted = []
for item in data:
    question = item.get('question', '')
    choices = item.get('choices', [])
    answer = item.get('answer', '')
    explanation = item.get('explanation', '')

    # 정답 인덱스 추출 (A=0, B=1, ...)
    answer_index = ord(answer.upper()) - ord('A')
    # 보기에서 'A. ~' 형식의 텍스트에서 실제 내용만 추출
    def extract_text(choice):
        if '. ' in choice:
            return choice.split('. ', 1)[1]
        return choice

    correct = extract_text(choices[answer_index]) if 0 <= answer_index < len(choices) else ''
    wrong = [extract_text(c) for i, c in enumerate(choices) if i != answer_index]

    converted.append({
        'question': question,
        'correct': correct,
        'wrong': wrong,
        'explanation': explanation
    })

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(converted, f, ensure_ascii=False, indent=2)

print(f'변환 완료: {output_file}') 