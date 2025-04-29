import json
import subprocess
import os
from datetime import datetime

def update_quiz_files():
    # 모든 퀴즈 파일 읽기
    files = ['health_quiz_set_new.json', 'health_quiz_set_02.json', 'health_quiz_set_03.json', 'health_quiz_set_04.json']
    all_questions = []

    for file in files:
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict) and 'questions' in data:
                    all_questions.extend(data['questions'])
                else:
                    all_questions.extend(data)

    # 결과 저장
    with open('health_quiz_set_all.json', 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    print(f'총 {len(all_questions)}개의 문제가 저장되었습니다.')

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