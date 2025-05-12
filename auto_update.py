import json
import subprocess
import os
from datetime import datetime

def normalize_question(q):
    """문제 객체를 정규화하여 비교 가능한 형태로 만듭니다."""
    return {
        'question': q.get('question', '').strip(),
        'correct': q.get('correct', '').strip(),
        'wrong': sorted([w.strip() for w in q.get('wrong', [])]),
        'explanation': q.get('explanation', '').strip()
    }

def is_duplicate(q1, q2):
    """두 문제가 동일한지 비교합니다."""
    n1 = normalize_question(q1)
    n2 = normalize_question(q2)
    return (n1['question'] == n2['question'] and 
            n1['correct'] == n2['correct'] and 
            n1['wrong'] == n2['wrong'])

def update_quiz_files():
    # 기존 문제 파일 읽기
    all_questions = []
    if os.path.exists('health_quiz_set_all.json'):
        with open('health_quiz_set_all.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                all_questions = data
            else:
                all_questions = data.get('questions', [])
            print(f'기존 문제 수: {len(all_questions)}개')
    
    # 새로운 문제 파일들 읽기
    new_files = [
        'health_quiz_set_new.json',
        'health_quiz_set_02.json',
        'health_quiz_set_03.json',
        'health_quiz_set_04.json',
        'quiz1.json',
        'quiz2.json',
        'quiz3.json'  # quiz2.json과 quiz3.json 추가
    ]
    new_questions = []

    for file in new_files:
        if os.path.exists(file):
            print(f'{file} 파일을 읽는 중...')
            with open(file, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                    # 파일이 리스트인 경우와 객체인 경우를 모두 처리
                    if isinstance(data, list):
                        questions = data
                    else:
                        questions = data.get('questions', [])
                    
                    if isinstance(questions, list):
                        # 각 문제가 올바른 형식인지 확인
                        valid_questions = [q for q in questions if isinstance(q, dict) and 'question' in q]
                        new_questions.extend(valid_questions)
                        print(f'{file}에서 {len(valid_questions)}개의 문제를 읽었습니다.')
                    else:
                        print(f'{file}의 형식이 올바르지 않습니다.')
                except json.JSONDecodeError as e:
                    print(f'{file} 파일을 읽는 중 오류 발생: {e}')
                except Exception as e:
                    print(f'{file} 파일 처리 중 오류 발생: {e}')
        else:
            print(f'{file} 파일이 존재하지 않습니다.')

    print(f'새로운 문제 파일들에서 총 {len(new_questions)}개의 문제를 읽었습니다.')
    
    # 중복 제거 (question 텍스트 기준)
    questions_set = {q['question'] for q in all_questions if isinstance(q, dict) and 'question' in q}
    added = 0
    
    for q in new_questions:
        if isinstance(q, dict) and 'question' in q and q['question'] not in questions_set:
            all_questions.append(q)
            questions_set.add(q['question'])
            added += 1
    
    # 결과 저장
    with open('health_quiz_set_all.json', 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)
    
    print(f"새로 추가된 문제: {added}개")
    print(f"총 문제 수: {len(all_questions)}개")

def git_push():
    try:
        # Git 명령어 실행
        subprocess.run(['git', 'add', '.'], check=True)
        subprocess.run(['git', 'commit', '-m', f'자동 업데이트: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'], check=True)
        subprocess.run(['git', 'push'], check=True)
        print('Git 푸시가 성공적으로 완료되었습니다.')
    except subprocess.CalledProcessError as e:
        print(f'Git 푸시 중 오류가 발생했습니다: {e}')

if __name__ == '__main__':
    update_quiz_files()
    git_push() 