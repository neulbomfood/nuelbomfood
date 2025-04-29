import json

# 모든 퀴즈 파일 읽기
files = ['health_quiz_set_new.json', 'health_quiz_set_02.json', 'health_quiz_set_03.json', 'health_quiz_set_04.json']
all_questions = []

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        if isinstance(data, dict) and 'questions' in data:
            all_questions.extend(data['questions'])
        else:
            all_questions.extend(data)

# 결과 저장
with open('health_quiz_set_final.json', 'w', encoding='utf-8') as f:
    json.dump(all_questions, f, ensure_ascii=False, indent=2)

print(f'총 {len(all_questions)}개의 문제가 저장되었습니다.') 