import json

# 기존 전체 문제 파일 읽기
with open('health_quiz_set_all.json', 'r', encoding='utf-8') as f:
    all_data = json.load(f)

# 새로 추가할 문제 파일 읽기 (quiz1.json)
with open('quiz1.json', 'r', encoding='utf-8') as f:
    new_data = json.load(f)

# 중복 제거 (question 텍스트 기준)
questions_set = set(q['question'] for q in all_data)
added = 0

for q in new_data:
    if q['question'] not in questions_set:
        all_data.append(q)
        questions_set.add(q['question'])
        added += 1

# 결과 저장
with open('health_quiz_set_all.json', 'w', encoding='utf-8') as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)

print(f"새로 추가된 문제: {added}개")
print(f"총 문제 수: {len(all_data)}개") 