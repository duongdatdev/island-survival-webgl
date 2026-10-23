# Island Survival Dedicated Server

Đây là server multiplayer chạy riêng trên Windows, Linux hoặc macOS. Không cần build game, trình duyệt, GPU hoặc thư viện đồ họa trên máy host. Bản game được mở và phân phối riêng; người chơi vào mục **Nhiều người chơi → Kết nối trực tiếp** và nhập `IP-MAY-HOST:3000`.

## Chạy gói server đã tải

Cài Node.js theo `engines` trong `package.json` (khuyến nghị Node.js 22 LTS). Giải nén gói `.tgz`, mở terminal trong thư mục `package`, rồi chạy:

```sh
npm ci --omit=dev
npm start
```

Windows có thể chạy `start-server.cmd`; Linux/macOS dùng `sh start-server.sh`. Script sẽ cài dependency lần đầu nếu chưa có. Sau khi cài dependency, server chạy được trong LAN không cần Internet. Giữ terminal đang chạy; dừng bằng Ctrl+C.

Server mặc định lắng nghe `0.0.0.0:3000`, in địa chỉ LAN để gửi bạn bè. Người host có thể chơi bằng bản game riêng và địa chỉ `localhost:3000`. Mở địa chỉ server trong trình duyệt chỉ hiện thông tin dịch vụ, không mở game.

## Cấu hình

| Biến môi trường | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3000` | Cổng TCP cho WebSocket và health check |
| `HOST` | `0.0.0.0` | Giao diện mạng lắng nghe |
| `DATA_DIR` | `server-data` cạnh package | Nơi giữ thế giới và nhân vật |
| `MAX_PLAYERS` | `8` | 2–16 người/phòng |
| `MAX_ROOMS` | `16` | 1–64 phòng |
| `SERVER_PASSWORD` | trống | Mật khẩu truy cập chung |

PowerShell:

```powershell
$env:PORT = '3000'
$env:SERVER_PASSWORD = 'mat-khau-cua-ban'
npm start
```

Không tự đọc file `.env`. Lưu và sao lưu thư mục `server-data` khi server dừng; đừng xóa thư mục này khi cập nhật package. `GET /api/health` kiểm tra tình trạng server. Nếu host ngoài LAN, cấu hình firewall/NAT hoặc reverse proxy HTTPS/WSS cho cổng này. Trang game HTTPS cần kết nối WSS tới server.

Đây là server co-op cho nhóm tin cậy: lưu dữ liệu, xác thực schema và phân xử giao dịch trên server; mô phỏng gameplay/AI vẫn do một trình duyệt đang hoạt động điều phối. Khi mọi người rời game, thế giới dừng tiến thời gian. Server chưa phải bản mô phỏng vật lý hoàn toàn độc lập hoặc có chống gian lận cho cộng đồng công khai.

## Dành cho người phát triển

Trong checkout dự án đầy đủ, có thể chạy `npm run server` từ thư mục gốc; hoặc `cd server`, `npm ci --omit=dev`, `npm start`. Mã nguồn dùng chung các module schema/giao thức với client để cùng phiên bản. Để xuất gói độc lập không cần checkout, chạy `npm run build:server` từ gốc dự án; archive nằm trong `dist-server/` và đã mang theo các module dùng chung cần thiết.
