# Model cho Island Survival 2.0

Bộ model đã được tải và chuẩn bị trong dự án. Hiện chưa có tài nguyên nào cần người dùng tải thủ công.

Thư viện gồm **95 GLB**: 73 model từ nguồn CC0 (gồm model chuyển đổi và tái sử dụng), 22 model dựng riêng trong Blender. Tổng hình học của cả thư viện là 40.508 tam giác; tổng dung lượng GLB là 4.444.776 byte. Đây là số liệu thư viện, không phải số lượng vật thể vẽ trong mỗi khung hình hay bằng chứng FPS.

| Nguồn | Số GLB trong thư viện | Mục đích |
|---|---:|---|
| [Kenney Survival Kit](https://kenney.nl/assets/survival-kit) | 24 | Rương, giường, bàn chế tạo, dụng cụ, cá, vật tư |
| [Kenney Pirate Kit](https://kenney.nl/assets/pirate-kit) | 9 | Xác tàu, thùng hàng, bến, cột buồm, tháp |
| [Kenney Modular Cave Kit](https://kenney.nl/assets/modular-cave-kit) | 11 | Lối vào, hành lang, phòng mỏ, cầu thang |
| [Kenney Building Kit](https://kenney.nl/assets/building-kit) | 8 | Tường, cửa, nền, mái, cầu thang cho địa điểm bỏ hoang |
| [Kenney Food Kit](https://kenney.nl/assets/food-kit) | 10 | Thực phẩm, nguyên liệu, túi đồ |
| [Quaternius Ultimate Crops](https://quaternius.com/packs/ultimatecrops.html) | 4 | Các giai đoạn phát triển cây thực phẩm |
| Quaternius Survival Pack có sẵn | 6 | Radio, pin, la bàn, lều, đuốc, bè |
| [Quaternius Fishing Rod](https://poly.pizza/m/skqPvEIpve) | 1 | Cần câu |
| Blender, dựng riêng cho dự án | 22 | Công trình, thiết bị và năm bộ phận bè tự chế |

Các nguồn bên ngoài ở bảng trên có giấy phép CC0. Model dựng riêng thuộc dự án. URL nguồn, giấy phép và SHA256 gói tải nằm trong `assets/campaign/sources.json`; kích thước, số tam giác, animation và đường dẫn từng GLB nằm trong `assets/campaign/manifest.json`.

Đã đối chiếu lại trang chính thức của Kenney Survival Kit và Quaternius Ultimate Crops ngày 11/10/2026: cả hai vẫn công bố CC0. Va chạm mặt bàn/trần thấp hiện kiểm tra toàn bộ chiều cao nhân vật; sàn ghép dùng dấu chân tròn để tránh tụt vào khe giữa các tấm. Kiểm tra hình học lối vào hang, trạm và điểm khảo sát trên 100 seed đã qua; đây chưa phải bằng chứng hoàn thành toàn bộ chuyến khám phá bằng người chơi.

## Bộ dựng riêng bằng Blender MCP

- Căn cứ: móng 2 m, sàn, tường, khung cửa, cửa bản lề và mái. Bộ này được dựng đồng bộ để ghép theo lưới và dùng cùng kích thước với kiểm tra va chạm.
- Sản xuất: lò nung, giàn hun khói, bẫy cá, bồn nước và khay trồng.
- Khám phá: móc kéo, bộ lặn và anten tín hiệu.
- Trục vớt: dùng thùng Kenney, hộp pin Quaternius và động cơ Blender đã có. Ba model có vị trí tương tác và va chạm riêng quanh xác tàu; căn theo đáy biển và bù gốc động cơ để không bị chìm vào đất. Chưa cần người dùng tải thêm model.
- Cây trồng: ba giai đoạn thảo dược.
- Bè: khung gỗ, phao thùng, mái chèo, buồm vá và động cơ tận dụng. Mỗi phần dùng cùng gốc tại mặt nước và chỉ xuất hiện khi người chơi lắp bộ phận tương ứng; thân xuồng cao su cũ không còn dùng cho Campaign.

Nguồn chỉnh sửa: `assets/campaign/sources/campaign-props.blend`. Script dựng lại: `scripts/build-campaign-models.py`, chạy qua Blender MCP trong Blender đã kết nối; script này gọi `scripts/build-raft-equipment.py` để dựng đủ năm phần bè. Có thể chạy riêng script bè để cập nhật bộ đó. Không đưa file `.blend`, OBJ nguồn hoặc ZIP tải về vào bản phát hành.

## Sử dụng theo tính năng

| Tính năng | Model chính | Trạng thái |
|---|---|---|
| Xây căn cứ, mở rương, giường, trạm | Bộ nhà Blender + Survival Kit | Đã nối vào Campaign; tiếp tục hoàn thiện va chạm cửa và nội thất |
| Lò nung, hun khói, trồng cây | Bộ Blender + cây Quaternius | Đã nối sản xuất và giao diện; còn kiểm thử toàn bộ chuỗi chơi |
| Móc kéo đồ trôi dạt | `campaign_hook` | Đã nối thao tác Q và dây kéo |
| Câu cá | `quaternius_fishing_rod` + cá Survival Kit | Đã nối thời điểm cắn câu và minigame độ căng dây |
| Lặn xác tàu | `campaign_dive_kit`, `pirate_ship-wreck` | Bơi/lặn và oxy đã nối; nội thất xác tàu còn cần hoàn thiện |
| Hang mỏ | Cave Kit | Đã ghép phòng/cửa hang và va chạm tam giác; kiểm tra lối vào trên 100 seed |
| Trạm khí tượng, kho, tháp | Bộ nhà Blender/Pirate + radio/anten | Đã có nhà trạm, cửa cần cuốc sắt, thùng tiếp tế và máy phát; tiếp tục kiểm tra bằng góc nhìn người chơi |
| Khảo sát hiện trường | Cột Pirate, bồn nước Blender, thùng/đồng hồ/bàn Survival | Ba thiết bị gió/lưu lượng/áp suất đã có E, giải bài hiệu chỉnh và lưu từng phần; dùng lại thư viện, không cần tải thêm |
| Hai tuyến kết thúc | Năm phần bè Blender, radio, pin, anten | Đã nối vượt biển/cứu hộ và checkpoint; bè hiển thị theo bộ phận lắp, có nguồn Blender chỉnh sửa |

## Quy chuẩn và kiểm tra

- Giữ phong cách low poly, màu đất/gỗ/vải và vật liệu đơn giản; dùng lại model hiện có cho cây và động vật.
- Bộ nhà và hang của Kenney giữ đơn vị mét. Không phóng sàn mỏng lên chiều cao tường: sàn 2 m phải giữ 2 m.
- Bộ nhà Blender giữ pivot/đơn vị để móng, khung cửa và cửa xoay khớp nhau. Đạo cụ khác được chuẩn hóa kích thước và đặt chân tại mặt đất qua loader.
- Ảnh palette được nhúng trong GLB. Chỉ bỏ texture transform đã xác minh là phép biến đổi đồng nhất.
- Kiểm tra hình học/giấy phép bằng `node --test tests/campaign-assets.test.js`; kiểm tra hình ảnh thực qua `/tools/asset-gallery.html` và `tests/browser/assets.spec.js`.
- Giấy phép được sao chép cùng bản build. Tổng thư viện đã được tải/vẽ qua renderer thật; việc xuất hiện trong thư viện không đồng nghĩa toàn bộ gameplay đã hoàn thành.

## Nếu cần thêm model

Hiệu chỉnh xác tàu ngày 11/10: sàn khoang mở nằm cao hơn gốc model đã chuẩn hóa 1,385 m. Bản kê hàng đặt tại gốc +1,7 m để túi ghi chép nằm trên sàn, vẫn ở dưới nước. Kiểm tra đường bơi/va chạm và tia tương tác trên 100 seed đạt; đọc bằng E và lưu qua tải lại đạt trong browser thật. Ảnh khoang đã được kiểm tra trực quan. Không cần tải hoặc dựng thêm model cho sửa đổi này; chuỗi chơi toàn bộ vẫn đang được kiểm thử.

Tìm từ nguồn tác giả và kiểm tra giấy phép trước; tải trực tiếp được thì tự tải. Nếu nguồn cần tài khoản hoặc thao tác tải riêng, báo người dùng đúng trang và tên file cần tải. Nếu model không hợp phong cách, pivot hoặc kích thước gameplay, dựng phần còn thiếu qua Blender MCP và giữ nguồn chỉnh sửa.
