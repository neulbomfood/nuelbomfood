# 늘봄퀴즈 카카오톡 공유 보상 연결

카카오 앱 연결 전에는 홈에 설치 링크 복사만 표시된다. 수신자의 설치, 클릭, 가입 기록은 사용하지 않는다.

1. 카카오디벨로퍼스에서 늘봄 앱을 만들고 JavaScript SDK 도메인과 제품 링크 웹 도메인에 `https://neulbomfood.github.io`를 등록한다. 도구의 메시지 템플릿에서 늘봄퀴즈 설치 안내를 만들고 고정 웹 링크를 `https://neulbomfood.github.io/nuelbomfood/install.html`로 지정한다. 이 주소는 기존 Google Play 설치 링크로 즉시 이동한다.
2. 늘봄의 Firebase 프로젝트 `neulbom-healt-quiz`에서 Cloud Functions 2세대와 Firestore를 사용할 수 있는지 확인한다. 저장소 루트에서 `npm ci --prefix _kakao-share` 후 `firebase functions:secrets:set KAKAO_PRIMARY_ADMIN_KEY --project neulbom-healt-quiz`로 대표 어드민 키를 비공개 입력한다.
3. `firebase deploy --only functions:neulbom-share --project neulbom-healt-quiz`로 해당 함수 두 개를 배포한다. 배포 시 묻는 `KAKAO_SHARE_TEMPLATE_ID`에는 1번 템플릿의 숫자 ID를 입력한다. 카카오 앱의 웹훅 메뉴에 배포된 `kakaoShareWebhook` URL을 **POST**로 등록한다.
4. 운영 Firestore의 기존 지갑 읽기·쓰기 권한을 확인한다. 지갑 소유자만 최초 공유 키 해시를 등록하도록 하고, 등록된 해시·서버 공유 횟수 및 `kakaoShareDeliveries`, `kakaoShareAwards`, `pointsHistory/kakao_*`는 클라이언트에서 수정할 수 없게 한다. 저장소의 firestore.rules와 실제 운영 규칙이 같은지 확인하고 해당 보호 규칙을 병합한다. 위 함수 배포 명령은 운영 Firestore 규칙을 배포하지 않는다.
5. index.html 상단의 `kakao-javascript-key`에 **공개 JavaScript 키**, `kakao-share-template-id`에 서버와 동일한 템플릿 ID를 넣고 웹을 배포한다. 일반 1:1 채팅방 첫 전송, 같은 방 재전송, 링크 복사를 실제 기기에서 확인한다. 운영 코드·GitHub에는 대표 어드민 키를 넣지 않는다.

중복 기준은 늘봄 지갑 ID와 카카오 채팅방 ID의 조합이다. 단체방은 한 방으로 센다. 같은 사람이 다른 방에도 있는지는 카카오가 제공하지 않는다. 일반 나와의 채팅은 항상 제외한다. 그룹에 발신자 혼자 남았다는 선택 정보가 오는 경우에도 제외한다. 앱의 대표 어드민 키를 교체할 때는 처리 대기 중인 이벤트를 먼저 완료한다.

서버는 인증된 전송 확인을 먼저 저장하고 동일한 이벤트의 재수신을 무시한다. 후속 함수가 채팅방 영수증, 사용자 잔액, 닉네임 조회용 포인트 내역을 한 트랜잭션에 기록한다. Firebase Emulator에서 실행하는 통합 테스트에는 별도 테스트 프로젝트 이름을 사용한다.

공식 문서 · [카카오톡 공유 웹훅](https://developers.kakao.com/docs/ko/kakaotalk-share/callback) · [카카오 공유 템플릿](https://developers.kakao.com/docs/ko/kakaotalk-share/js-link) · [Firebase 비밀 키 설정](https://firebase.google.com/docs/functions/config-env)
