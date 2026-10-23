# Chơi online qua LAN / server tự host

Menu chính có hai lựa chọn: **CHƠI ĐƠN** để chơi offline và lưu thế giới trong trình duyệt; **NHIỀU NGƯỜI CHƠI** để vào server LAN hoặc server tự host. Bản lưu chơi đơn cũ vẫn dùng được và nằm riêng với các đảo trên server. Chơi đơn không cần chạy hoặc kết nối server multiplayer; có thể mở ứng dụng bằng `npm run dev` khi không có Internet.

Chế độ nhiều người dùng **Dedicated Server chạy riêng** do bất kỳ ai trong nhóm host. Bản game và server là hai chương trình độc lập: trang game mặc định ở cổng 5173 khi phát triển; server multiplayer ở cổng TCP 3000. Người chơi luôn nhập địa chỉ server; không mặc định dùng địa chỉ trang game. Không cần tài khoản hoặc dịch vụ matchmaking bên ngoài.

## Chạy trên Windows, Linux hoặc macOS

Cần Node.js theo yêu cầu trong `package.json`. Người chỉ chơi mở bản game và không cần host server. Trong dự án, chạy bản game bằng:

```sh
npm ci
npm start
```

Mở địa chỉ game in trong terminal, thường là `http://localhost:5173`. Có thể build `npm run build` rồi đưa thư mục `dist/` lên nơi host website tĩnh để mọi người mở cùng một bản game. `npm run preview` chỉ xem thử bản game production, không khởi động server multiplayer.

Người muốn host có hai cách:

- Trong checkout đầy đủ, mở terminal khác và chạy `npm run server`. Không cần build game để chạy server.
- Tạo gói độc lập bằng `npm run build:server`. Gửi file `dist-server/island-survival-dedicated-server-1.0.0.tgz` cho người host. Giải nén, mở thư mục `package`, chạy `npm ci --omit=dev` rồi `npm start`. Windows có thể dùng `start-server.cmd`; Linux/macOS dùng `sh start-server.sh`. Gói chỉ mang mã server và schema dùng chung, không có đồ họa hoặc assets game. Xem thêm [hướng dẫn gói server](../server/README.md).

Giữ terminal server chạy. Server in các địa chỉ IPv4 LAN, ví dụ `192.168.1.10:3000`. Người host cũng phải mở bản game riêng để chơi; `localhost:3000` chỉ là địa chỉ kết nối multiplayer. Truy cập server bằng trình duyệt chỉ hiện thông tin dịch vụ.

1. Trong bản game, chọn **NHIỀU NGƯỜI CHƠI**. Danh sách gồm các địa chỉ server bạn đã lưu; lần đầu danh sách trống.
2. **Thêm server**: đặt tên, nhập IP và cổng (ví dụ `192.168.1.10:3000`) hoặc địa chỉ HTTPS của server, rồi **Lưu server**. Danh sách lưu riêng trên trình duyệt, hỗ trợ sửa và xóa; không lưu mật khẩu.
3. Chọn server rồi **Vào server**, hoặc dùng **Kết nối trực tiếp**, nhập địa chỉ và tên người chơi rồi kết nối. Không bắt buộc mã phòng. Server mới sẽ tạo đảo Campaign mặc định; server có đảo sẽ chọn đảo công khai sẵn sàng đầu tiên, hoặc đảo có mật khẩu đầu tiên nếu không có đảo công khai.
4. Khi server có nhiều đảo, dùng **Tải danh sách đảo** và chọn đảo cần vào. Cũng có thể nhập mã phòng trực tiếp. Nhập mật khẩu phòng / server nếu có.
5. Để tạo đảo khác, chọn **Tạo phòng**, đặt tên, chế độ Campaign/Classic, seed và mật khẩu nếu cần. Mã phòng hiện trong game để mời người khác vào đúng đảo.

**Làm mới** cập nhật trạng thái online, độ trễ, số đảo và người chơi của các địa chỉ đã lưu. Trình duyệt không tự quét toàn bộ LAN; cần nhập địa chỉ máy chủ. Với server có mật khẩu truy cập chung, mở phần mật khẩu trong form để kết nối hoặc tải danh sách đảo.

Nếu Windows hiện thông báo tường lửa, cho phép Node.js trên mạng riêng. Khi không kết nối được, kiểm tra cùng mạng LAN, đúng IP/cổng, server còn chạy và TCP 3000 được phép đi vào máy chủ. Một số Wi-Fi khách bật cách ly thiết bị; cần đổi sang mạng cho phép các thiết bị liên lạc.

## Lưu và vào lại

- Server tự ghi dữ liệu khoảng mỗi 3 giây và khi người chơi rời phòng; game gửi cập nhật khoảng mỗi 250 ms. **Esc → Lưu** chờ server xác nhận đã ghi xuống ổ đĩa. Nên dùng nút này trước khi đóng tab.
- Dữ liệu phòng và nhân vật nằm trong `server-data/worlds.json`. Dừng server rồi sao lưu toàn bộ thư mục `server-data`. Khởi động lại server giữ nguyên mã phòng.
- Trình duyệt giữ một mã bí mật để tìm lại nhân vật. Dùng cùng địa chỉ server, mã phòng và hồ sơ trình duyệt để tiếp tục. Đổi IP/tên miền, xóa dữ liệu trang hoặc dùng trình duyệt khác sẽ tạo nhân vật khác.
- Mật khẩu phòng được băm trước khi ghi; mã nhận diện nhân vật là dữ liệu bí mật. Giữ riêng thư mục dữ liệu và bản sao lưu.
- Mất kết nối sẽ dừng nhân vật và hiện nút về menu. Server giữ giao dịch đã xác nhận; vào lại phòng để tiếp tục. Các thay đổi chưa được xác nhận khi mất mạng có thể không được giữ.
- Phòng mặc định tối đa 8 người đồng thời. Server mặc định giữ tối đa 16 phòng và 128 nhân vật đã lưu mỗi phòng. Các phòng đã tạo được giữ lại sau khi hết người chơi.

## Những gì được đồng bộ

Người chơi nhìn thấy nhân vật và tên của nhau. Vị trí được gửi khoảng 12 lần/giây và nội suy khi vẽ. Mỗi người có túi đồ, chỉ số sinh tồn, hoạt động câu cá và nhân vật riêng.

Tài nguyên trên đảo, vật trôi ngoài biển, quyền móc kéo, cây đã chặt, công trình, nội dung rương, sản xuất, lắp bè, thiết bị, cache và tiến trình chương được chia sẻ. Server xét giao dịch theo thứ tự nhận và kiểm tra trạng thái trước khi áp dụng. Nếu hai người sửa cùng một vật, một giao dịch thắng; giao dịch còn lại khôi phục túi đồ và thế giới rồi hiện thông báo thử lại. Các phần của cùng hệ thống, chẳng hạn các rương và máy sản xuất trong registry, được giao dịch cùng nhau để giữ nhất quán.

Thời gian, thời tiết, sản xuất và di chuyển động vật do một trình duyệt đang hoạt động điều phối. Khi người đó rời phòng hoặc mở menu tạm dừng/nhật ký, quyền điều phối chuyển cho người khác đang hoạt động. Động vật hướng tới người chơi gần nhất; mỗi máy tính sát thương nhận bởi nhân vật của mình. Chơi co-op không có PvP. Classic cho phép hồi sinh nhân vật tại điểm xuất phát, mất túi đồ của nhân vật đó và giữ thế giới chung.

Đây là kiến trúc co-op dành cho LAN/nhóm tin cậy: server lưu dữ liệu, kiểm tra schema và phân xử giao dịch, còn gameplay và vật lý chạy trên trình duyệt. Server chưa chạy mô phỏng vật lý độc lập và chưa có chống gian lận cho server công cộng. Khi không có người chơi hoạt động, thế giới không tiến thời gian. Ngủ tua tới sáng bị tắt trong phòng online để giữ thời gian chung; thử thách kết thúc diễn ra cho từng người chơi. Hiện chưa có chat, danh sách phòng công khai, chuyển nhân vật sang trình duyệt khác hoặc nhập bản lưu offline cũ.

## Tùy chỉnh server

Server đọc biến môi trường:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Giao diện mạng lắng nghe |
| `PORT` | `3000` | Cổng HTTP/WebSocket |
| `DATA_DIR` | `server-data` của dự án | Thư mục lưu dữ liệu |
| `MAX_PLAYERS` | `8` | 2–16 người đồng thời/phòng |
| `MAX_ROOMS` | `16` | 1–64 phòng/server |
| `SERVER_PASSWORD` | trống | Mật khẩu truy cập chung, nhập trong mục mở rộng của form |

Ví dụ PowerShell:

```powershell
$env:PORT = '3000'
$env:MAX_PLAYERS = '8'
$env:SERVER_PASSWORD = 'doi-mat-khau-nay'
npm start
```

Không tự động đọc file `.env` khi chạy Node trực tiếp. Nếu dùng Compose, Docker Compose đọc `.env` cho biến `SERVER_PASSWORD`.

## Docker

```sh
docker compose up -d --build
docker compose logs -f island
```

Container chỉ chạy Dedicated Server; không build hoặc phục vụ trang game. Trong bản game riêng, kết nối đến `IP-MAY-CHU:3000`. Volume `island-worlds` giữ bản lưu qua các lần tạo lại container. Dừng bằng `docker compose down`; giữ volume khi muốn tiếp tục tiến trình.

## Tự host qua Internet

Trên VPS, chạy bằng Node hoặc Docker như trên và cho phép cổng cần dùng. Nếu chạy tại nhà, bạn bè bên ngoài LAN cần địa chỉ công khai và cấu hình NAT/port-forward TCP đến máy chủ; kết nối có CGNAT cần giải pháp mạng riêng hoặc VPS của bạn.

Khi dùng tên miền HTTPS, đặt reverse proxy trước server và chuyển tiếp cả HTTP lẫn WebSocket `/ws`. Ví dụ Nginx trong một khối `server` đã cấu hình TLS:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 60s;
}
```

Trang HTTPS tự dùng WSS. Khi nhập địa chỉ server khác trên một trang HTTPS, nhập địa chỉ HTTPS/WSS tương ứng. Endpoint `GET /api/health` trả trạng thái để kiểm tra server. Tham khảo API WebSocket dùng trong dự án tại [ws chính thức](https://github.com/websockets/ws/blob/master/doc/ws.md).

## Phát triển và kiểm thử

Mở hai terminal:

```sh
# Terminal 1
npm run server:dev
# Terminal 2
npm run dev
```

Hai tiến trình hoạt động độc lập. Trong game ở cổng 5173, nhập `localhost:3000` để kết nối server đang phát triển. Vite không tự khởi động hoặc chuyển tiếp sang server. Bài kiểm thử trình duyệt cũng mở client và server trên hai cổng riêng.

```sh
node --test tests/multiplayer.test.js
npm run build
npx playwright test tests/browser/multiplayer.spec.js
```

Trên máy có Chrome nhưng chưa cài Chromium của Playwright, có thể đặt `PLAYWRIGHT_CHANNEL=chrome`. Trong môi trường Windows có GPU, `PLAYWRIGHT_GPU=native` dùng ANGLE/D3D11 cho bài kiểm thử game.
