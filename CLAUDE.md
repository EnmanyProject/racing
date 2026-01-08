# Racing Project Instructions

## 🚨 CRITICAL: Process Management Rules

**NEVER use broad process kill commands:**
- ❌ `taskkill //F //IM node.exe` - 모든 node 프로세스 종료 금지
- ❌ `taskkill //F //IM python.exe` - 모든 python 프로세스 종료 금지
- ❌ `pkill node` / `killall node` - 동일하게 금지

**대신 이렇게 해야 함:**
- ✅ 사용자에게 직접 프로세스 종료 요청
- ✅ 특정 PID만 종료: `taskkill //F //PID <specific_pid>`
- ✅ 특정 포트의 프로세스만 종료 (사용자 확인 후)

**이유:** 개발자가 여러 터미널에서 node 프로세스를 실행 중일 수 있음. 전체 종료는 모든 작업을 중단시킴.

## Development Setup

- Server: `cd server && pnpm run dev` (port 3000)
- Client: `cd client && pnpm run dev` (port 5173)

## Tech Stack

- Frontend: TypeScript, Vite, Canvas
- Backend: TypeScript, Fastify, WebSocket
- Monorepo: pnpm workspaces
