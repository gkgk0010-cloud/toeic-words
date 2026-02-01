// config.example.js 를 config.js 로 복사한 뒤 값 채우기
// config.js 는 .gitignore 에 넣어서 API 키가 올라가지 않게 하세요.

window.APP_CONFIG = {
  // answer_logs / student_status용 (모니터·CCTV 연동)
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: '',

  // 이번 세트의 테스트 이름 = 노션 제목 → answer_logs.tag, last_answer_tag 에 들어감
  TEST_TITLE: '토익 시제부사'
};
