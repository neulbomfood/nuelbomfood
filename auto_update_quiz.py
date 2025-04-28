import subprocess
import os
import re

# 1. 통합 변환 스크립트 실행
print("퀴즈 통합 변환 중...")
subprocess.run(["python", "convert_all_health_quiz.py"], check=True)

# 2. script.js 자동 점검 및 수정
print("script.js 자동 점검 및 수정 중...")
script_path = "script.js"
with open(script_path, "r", encoding="utf-8") as f:
    script = f.read()

# Promise.all([...]) 또는 여러 json fetch 부분이 남아있으면 자동으로 health_quiz_set_all.json만 fetch하도록 수정
if "Promise.all([" in script:
    pattern = re.compile(r"Promise\.all\(\s*\[.*?fetch\([^)]+?health_quiz_set_11\.json[^)]*?\)\.then\(res => res\.json\(\)\)\.catch\(\(\) => \[\]\)\s*\]\)\s*\.then\(quizSets => \{.*?updateProgress\(\);\s*\}\)", re.DOTALL)
    replacement = '''
fetch("health_quiz_set_all.json")
  .then(res => res.json())
  .then(quizList => {
    allQuestions = quizList.filter(q => q && q.question && q.correct && q.wrong);

    if (allQuestions.length === 0) {
      throw new Error('퀴즈 문제를 불러올 수 없습니다.');
    }

    // 중복 제거 (question을 기준으로)
    allQuestions = Array.from(new Map(allQuestions.map(q => [q.question, q])).values());

    selectNewQuestions();
    showLoading(false);
    showQuestion();
    updatePoints();
    updateProgress();
  })
  .catch(error => {
    console.error('Error loading questions:', error);
    document.getElementById('question').textContent = '문제를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침 해주세요.';
    showLoading(false);
  });
'''
    script, n = pattern.subn(replacement, script)
    if n > 0:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(script)
        print("script.js가 자동으로 최신 구조로 수정되었습니다.")
    else:
        print("script.js에서 수정할 부분을 찾지 못했습니다. 수동 확인이 필요할 수 있습니다.")
else:
    print("script.js는 이미 최신 구조입니다.")

# 3. git add, commit, push
print("git add, commit, push 실행 중...")
subprocess.run(["git", "add", "."], check=True)
subprocess.run(["git", "commit", "-m", "퀴즈 자동 통합 및 반영"], check=True)
subprocess.run(["git", "push", "origin", "main"], check=True)

print("모든 과정이 자동으로 완료되었습니다!") 