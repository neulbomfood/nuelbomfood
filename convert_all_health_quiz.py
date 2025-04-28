import json
import glob

# 변환 대상 파일 목록
quiz_files = sorted(glob.glob('health_quiz_set_*.json'))
output_file = 'health_quiz_set_all.json'

all_quiz = []
for file in quiz_files:
    with open(file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    for item in data:
        # 이미 변환된 구조라면 그대로 사용
        if 'correct' in item and 'wrong' in item:
            all_quiz.append({
                'question': item.get('question', ''),
                'correct': item.get('correct', ''),
                'wrong': item.get('wrong', []),
                'explanation': item.get('explanation', '')
            })
        # choice/answer 구조라면 변환
        elif 'choices' in item and 'answer' in item:
            choices = item.get('choices', [])
            answer = item.get('answer', '')
            # 정답 인덱스 추출 (A=0, B=1, ...)
            answer_index = ord(answer.upper()) - ord('A')
            def extract_text(choice):
                if '. ' in choice:
                    return choice.split('. ', 1)[1]
                return choice
            correct = extract_text(choices[answer_index]) if 0 <= answer_index < len(choices) else ''
            wrong = [extract_text(c) for i, c in enumerate(choices) if i != answer_index]
            all_quiz.append({
                'question': item.get('question', ''),
                'correct': correct,
                'wrong': wrong,
                'explanation': item.get('explanation', '')
            })

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(all_quiz, f, ensure_ascii=False, indent=2)

print(f'총 {len(all_quiz)}문제가 합쳐졌습니다. 결과 파일: {output_file}') 