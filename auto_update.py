import json
import subprocess
import os
from datetime import datetime

def update_quiz_files():
    # 기존 문제 파일 읽기
    all_questions = []
    if os.path.exists('health_quiz_set_all.json'):
        with open('health_quiz_set_all.json', 'r', encoding='utf-8') as f:
            all_questions = json.load(f)
    
    # 새로운 문제 파일들 읽기
    new_files = ['health_quiz_set_new.json', 'health_quiz_set_02.json', 'health_quiz_set_03.json', 'health_quiz_set_04.json']
    new_questions = []

    for file in new_files:
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict) and 'questions' in data:
                    new_questions.extend(data['questions'])
                else:
                    new_questions.extend(data)

    # 중복 제거를 위해 문제를 문자열로 변환하여 집합으로 만듦
    existing_questions = {json.dumps(q, ensure_ascii=False) for q in all_questions}
    for q in new_questions:
        q_str = json.dumps(q, ensure_ascii=False)
        if q_str not in existing_questions:
            all_questions.append(q)
            existing_questions.add(q_str)

    # 결과 저장
    with open('health_quiz_set_all.json', 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    print(f'총 {len(all_questions)}개의 문제가 저장되었습니다.')
    print(f'새로 추가된 문제: {len(new_questions)}개')

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