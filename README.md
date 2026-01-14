# Gecko Sprint

실시간 멀티플레이어 게코 레이싱 게임. 10마리의 네온 게코가 결승선을 향해 달리며, 플레이어들은 탭 버튼을 눌러 레이스에 영향을 줍니다.

## 주요 기능

- **개인 탭 시스템**: 게코 선택 → 3초 카운트다운 → 5초 탭핑 → 경주 대기
- **코인/티켓 경제**: 탭으로 게코를 부스트하고 코인 보상 획득
- **추천인 시스템**: 친구 초대로 보너스 코인 획득
- **실시간 레이싱**: 슬로우 모션 효과와 카메라 추적
- **출발선 미리보기**: 탭 완료 후 모든 게코가 대기하는 화면
- **S-wave 애니메이션**: 실제 도마뱀처럼 움직이는 게코

## 기술 스택

- **Backend:** Node.js, Express, Socket.IO, TypeScript
- **Frontend:** Vite + TypeScript + CSS 애니메이션
- **오디오:** Web Audio API (런타임 생성)
- **도구:** pnpm workspace, ESLint, Prettier, Vitest

## 시작하기

1. pnpm 설치:
   ```bash
   npm run setup
   ```

2. 의존성 설치:
   ```bash
   pnpm install
   ```

3. 개발 서버 실행:
   ```bash
   pnpm run dev
   ```
   - 백엔드: `http://localhost:4000`
   - 프론트엔드: `http://localhost:5173`

### 환경 설정

- Socket.IO URL 변경: `client/.env`에 `VITE_SOCKET_URL=<url>` 설정
- 프로덕션 빌드: `pnpm run build` → `pnpm run start`

## 게임 플로우

```
LOBBY (88초) → 개인 탭 → RACING (12초) → RESULTS (5초) → 반복
```

### 개인 탭 시스템

1. **게코 선택**: LOBBY에서 10마리 중 1마리 선택
2. **카운트다운**: 3초 카운트다운 (3, 2, 1)
3. **탭핑**: 5초 동안 최대한 빠르게 탭
4. **경주 대기**: 출발선에서 다른 플레이어 대기
5. **레이싱**: 모든 탭이 집계되어 게코 속도 결정

### 레이스 규칙

- **속도 공식**: `v = 0.2 + 0.8 * (clicks / maxClicks)`
- **슬로우 모션**: 레이스 마지막 2초
- **카메라 추적**: 내 게코를 중심으로 추적
- **봇**: 인간 플레이어당 6-12개 봇 생성

### 경제 시스템

| 항목 | 설명 |
| --- | --- |
| 티켓 | 탭 참여에 필요 (일일 무료 지급) |
| 코인 | 레이스 순위에 따른 보상 |
| 추천인 | 코드 공유로 양쪽 보너스 |

## 스크립트

| 명령어 | 설명 |
| --- | --- |
| `pnpm run dev` | 개발 서버 실행 (서버 + 클라이언트) |
| `pnpm run dev:server` | 백엔드만 실행 |
| `pnpm run dev:client` | 프론트엔드만 실행 |
| `pnpm run build` | 프로덕션 빌드 |
| `pnpm run start` | 프로덕션 서버 실행 |
| `pnpm run test` | 전체 테스트 |
| `pnpm run lint` | ESLint 검사 |
| `pnpm run format` | Prettier 포맷팅 |

## 프로젝트 구조

```
racing/
├── client/                 # 프론트엔드
│   ├── src/
│   │   ├── api.ts         # Socket.IO 통신
│   │   ├── store.ts       # 상태 관리
│   │   ├── ui.ts          # UI 렌더링
│   │   ├── animation.ts   # 레이스 애니메이션
│   │   └── styles.css     # 스타일시트
│   └── index.html
├── server/                 # 백엔드
│   ├── src/
│   │   ├── index.ts       # Express + Socket.IO
│   │   ├── gameLoop.ts    # 게임 상태 머신
│   │   ├── lobby.ts       # 플레이어 관리
│   │   ├── bots.ts        # AI 봇
│   │   └── types.ts       # 타입 정의
│   └── tests/
└── doc/                    # 디자인 문서
```

## Socket Events

| Event | 방향 | 설명 |
| --- | --- | --- |
| `welcome` | S→C | 연결 시 플레이어 정보 전송 |
| `state` | S→C | 게임 상태 스냅샷 |
| `raceProgress` | S→C | 레이스 진행 상황 (200ms 간격) |
| `boost:result` | S→C | 탭 결과 |
| `player:result` | S→C | 레이스 결과 및 보상 |
| `player:select` | C→S | 게코 선택 |
| `boost` | C→S | 탭 전송 |
| `wallet:claim` | C→S | 일일 티켓 수령 |

## 최근 업데이트

- 레이스 트랙 통 바닥 (주로 구분선 제거)
- 경주 대기 화면 (출발선 미리보기)
- 게코 S-wave 애니메이션
- 카메라 추적 시스템
- 개인 탭 카운트다운/카운트업 표시
