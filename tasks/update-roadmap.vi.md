# Kế hoạch cập nhật Island Survival 2.0

Mục tiêu là một chiến dịch cần **8–12 giờ chơi chủ động**, chia khoảng **5–7 phiên trong vài ngày ngoài đời**. Người chơi có thể chơi liên tục nếu muốn; game không bắt chờ ngày thật để mở chương. Thời gian dừng khi tạm dừng, ẩn tab hoặc đóng game. Mốc thời lượng này cần được xác nhận bằng người chơi mới, hiện chưa được chứng minh.

Phạm vi chi tiết và tiêu chí nghiệm thu được giữ tại `prd-island-survival-2.md`. Bộ model và trạng thái sử dụng nằm trong `model-plan.vi.md`.

Bảng nguyên liệu, cấp công nghệ, trạm và thời gian sản xuất lấy trực tiếp từ game nằm trong `recipe-catalogue.vi.md`. Khi đổi dữ liệu, tạo lại bằng `node scripts/document-campaign-recipes.mjs`.

Cài đặt Điều khiển đã có Giảm chuyển động, lưu giữa các lần chơi và áp dụng thiết lập hệ điều hành ngay trong phiên. Tắt lắc góc nhìn/nhịp tay và đổi FOV khi chạy; giữ thao tác và bước chân. Kiểm tra trực tiếp cài đặt, chạy và thay đổi thiết lập hệ điều hành đạt; chưa đồng nghĩa nghiệm thu toàn bộ khả năng tiếp cận.

Kiểm tra hồi quy bản trước tùy chọn chuyển động mới đạt 33/33; thay đổi sau đó được kiểm tra riêng. Đường đi bộ liên tục từ điểm xuất hiện qua bảy địa điểm trên đất liền đạt 913,6 m và giữ khám phá sau tải lại trên một seed. Căn cứ tối đa 400+80 công trình đạt mục tiêu FPS khi xoay góc nhìn trên máy RTX 4050 hiện tại. Báo cáo chi tiết và giới hạn từng phép đo nằm trong nhật ký tiến độ. Người dùng đã nhận chơi thử đầu tiên; bản production cố định ở `http://127.0.0.1:4173/`, hướng dẫn trong `player-guide.vi.md`. Chưa có kết quả chơi người thật.

Cập nhật 11/10: đã thêm ghim/bỏ ghim mục tiêu và công thức qua nhiều phiên; HUD tính cả rương cho phép dùng nguyên liệu trong 5 m. Bản kê hàng xác tàu đã nằm trên sàn khoang mở dưới nước và đọc được bằng tương tác thật. 245 kiểm thử logic đạt; lượt hồi quy 33 tình huống và chuỗi chương 1–5 đã đạt, với giới hạn phiên bản/fixture ghi trong nhật ký. Lượt đi bộ–bơi liên tục 1.028,660 m và lặn bằng Ctrl đã khám phá đủ tám địa điểm, đọc bản kê bằng E và giữ kết quả sau tải lại trên một seed; có cấp bộ lặn và bảo vệ sinh tồn, chưa chứng minh cân bằng hoặc toàn bộ nội thất. Chưa có bằng chứng từ người chơi mới cho mục tiêu 8–12 giờ. Bộ 95 model hiện tại đủ cho các phần này, không cần bạn tải thêm.

## Hành trình người chơi

Chuỗi thao tác từ thế giới mới qua chương 1–5 đã kiểm tra đạt và giữ nguyên khi tải lại, mở chương 6. Lượt kiểm tra có cấp vật liệu thô, vị trí tiếp cận và lời giải thiết bị; thời gian chạy 7,4 phút không phải thời lượng chiến dịch của người chơi.

| Chương | Mục tiêu | Thời gian tích lũy dự kiến |
|---|---|---|
| 1 — Dạt vào bờ | Nước ngọt, mái trú, lửa trại, nhật ký đắm tàu | 0–1 giờ |
| 2 — Một nơi để trở về | Căn cứ, rương, bàn chế tạo, trại bỏ hoang | 1–2,5 giờ |
| 3 — Dưới lòng đảo | Hang mỏ, quặng, lò nung, dụng cụ sắt | 2,5–4 giờ |
| 4 — Trạm im lặng | Tìm và sửa trạm khí tượng, lấy tọa độ, mở công nghệ cơ khí | 4–6 giờ |
| 5 — Những thứ còn thiếu | Bộ lặn, xác tàu dưới nước, kho ven biển, tiếp tế | 6–8 giờ |
| 6 — Rời đảo | Bè vượt biển hoặc khôi phục tín hiệu cứu hộ | 8–12 giờ |

Mỗi 45–90 phút nên có một khám phá, khả năng mới hoặc bước tiến đáng kể. Thời lượng đến từ khám phá, chuẩn bị, quyết định và hoạt động đa dạng; tránh tăng lượng nguyên liệu lặp lại để kéo dài game.

## Thứ tự thực hiện và điều kiện hoàn thành

| Mốc | Công việc | Điều kiện qua mốc |
|---|---|---|
| M0 — Nền tảng | Model, container dùng chung, lưu IndexedDB, backup, nhập/xuất, Classic/Campaign | Lưu thật qua tải lại trang, không mất/nhân đôi đồ, thế giới cũ giữ nguyên |
| M1 — Căn cứ | Xây theo lưới 2 m, xoay, cửa, mái, nhiều công trình, rương, giường, hồi sinh | Người chơi tự xây và sử dụng căn cứ; va chạm đúng; căn cứ và túi đồ rơi sống qua reload |
| M2 — Sống lâu | Ba cấp công nghệ, nhiên liệu, hàng đợi, cây trồng, bẫy cá, móc kéo, câu cá, độ khó | Chuỗi nguyên liệu → trạm → thành phẩm hoạt động; hết nhiên liệu/túi đầy/hủy lượt đều an toàn |
| M3 — Khám phá | Đảo lớn, địa hình theo chunk/LOD, hang mỏ, chương 1–3, bản đồ và nhật ký | Các địa điểm có hình học và va chạm; đường chính đi được trên 100 seed |
| M4 — Tiến tới thoát đảo | Trạm, bộ lặn/oxy, xác tàu, kho, chương 4–5, sự kiện và động vật | Có thể hoàn thành chuỗi mở khóa bằng thao tác chơi thật, vật tư chính luôn tìm được |
| M5 — Hai kết thúc | Thử thách bè và radio 8–12 phút, checkpoint, thất bại/thử lại, tiếp tục căn cứ | Cả hai tuyến có thể hoàn thành trong cùng thế giới; kết thúc không xóa căn cứ |
| M6 — Hoàn thiện | Tiếng Việt, hướng dẫn, âm thanh, giao diện, cân bằng, hiệu năng, tài liệu | Qua kiểm thử tự động và thủ công; 90 phút chơi dài, 10 lần đổi thế giới, 5 người mới chơi thử |

## Các hệ thống phải đi cùng nhau

- **Căn cứ:** móng/sàn/tường/cửa/mái một tầng; mái thực sự che mưa; tháo dỡ hoàn 75% vật liệu và không làm mất đồ bên trong. Có giới hạn 400 bộ phận nhà + 80 công trình chức năng.
- **Sinh tồn:** ngày trong game 30 phút, đói/khát/lạnh/ướt vừa phải, thức ăn hun khói, hai loại cây cần nước, hứng nước mưa, nghỉ đêm và lửa cần nhiên liệu.
- **Kho và sản xuất:** túi 28 ô, rương 24/48 ô, kho đầu ra trạm; chọn cho phép lấy nguyên liệu từ rương gần 5 m. Lò nung/giàn hun khói có tối đa 5 lượt chờ.
- **Hoạt động:** móc kéo tầm 20 m; ba nhóm cá với cắn câu và căng dây; bơi/lặn thật với oxy 45 giây hoặc 120 giây khi có bộ lặn. Xác tàu có ba điểm trục vớt bằng thao tác giữ phím, cần dụng cụ tương ứng và giữ tiến độ khi quay lại.
- **Thế giới:** tám địa điểm chính, năm vùng địa hình, hang là hình học riêng, bản đồ mở dần, la bàn, dấu căn cứ, dấu tùy chọn và túi đồ đã rơi.
- **Tiến trình:** sáu chương và sáu nhiệm vụ phụ; phát hiện sớm vẫn được ghi nhận; thưởng chỉ nhận một lần và chờ nếu túi đầy. Chương trạm khí tượng gồm nối mạch và ba thiết bị khảo sát (gió, lưu lượng, áp suất). Bản đo và đồ nhiệm vụ được bảo vệ khi chết.
- **Sự kiện:** hàng trôi sau bão, đàn cá, cây đổ mở đường; dùng lại cua/chim/lợn rừng/cá mập. Sự kiện không phá căn cứ hoặc đồ nhiệm vụ.
- **Thoát đảo:** bè cần buồm, định hướng và tiếp tế; cứu hộ cần radio, tọa độ, điện và tháp tín hiệu. Hiện rõ phần còn thiếu trước khi khởi hành.
- **Độ khó:** Thư giãn giảm tiêu hao/sát thương và giữ đồ; Tiêu chuẩn giữ hotbar, rơi đồ trong ba lô; Khắc nghiệt tăng tiêu hao/sát thương và rơi cả hotbar. Túi rơi tồn tại qua lưu/tải.

## Chưa đưa vào bản 2.0

Multiplayer, mobile, quần đảo, NPC có hội thoại/lồng tiếng, nhà nhiều tầng với vật lý kết cấu, bệnh phức tạp, thức ăn hỏng, độ bền dụng cụ, boss và New Game+.

## Trạng thái

Quy trình ghi nhận năm lượt chơi mới nằm trong `playtest-protocol.vi.md`; hiện chưa có kết quả người thật. Báo cáo đổi thế giới trong `retention-world-swaps.json` ghi riêng phép đo tài nguyên ngắn và không được dùng thay cho nghiệm thu 90 phút.

Đã kiểm tra căn cứ đạt đủ 400 phần nhà và 80 công trình chức năng; lưu/tải lại giữ nguyên công trình, 16 rương đầy, 80 lượt sản xuất và 8 luống cây. Tám mẫu đo đứng yên, mỗi mẫu 10 giây, với trời quang/bão và Medium/Low trên GPU AMD Radeon tích hợp đạt khoảng 120 FPS; chi tiết và giới hạn nằm trong `large-base-performance.json`. Kết quả chưa thay thế kiểm tra khi di chuyển, toàn bộ chiến dịch hoặc phiên dài 90 phút.

Hang mỏ đã có hai vỉa sâu để tiếp tục lấy sắt/đồng khi quặng rời trên đảo cạn. Mang cuốc và giữ phím tương tác: cuốc sắt mất 6 giây, cuốc đá 10 giây cho mỗi lớp 2 quặng. Tiến độ dở dang giữ qua tạm nghỉ, chết và lưu/tải; túi đầy thì quặng đã đào chờ tại chỗ. Việc đào cần thao tác khi đang chơi, không sinh quặng lúc đóng game. Tính năng này hỗ trợ nâng cấp căn cứ lâu dài; chưa chứng minh thời lượng chiến dịch 8–12 giờ.

Có thể tách một dây thừng thành 3 sợi thực vật bằng tay ngay cấp 1. Dây thu từ vật trôi biển và hàng bão giúp bổ sung sợi cho mái, luống trồng và đồ dùng sau khi sợi trên mặt đất hết. Chuyển đổi hai chiều không tăng nguyên liệu; túi thiếu chỗ thì không mất dây.

Sáu nhật ký phụ nay nằm tại các thùng hồ sơ dọc đường giữa những địa điểm chính. Đọc ghi chép địa phương để biết tuyến đường và khoảng cách cần tìm; có thể tìm theo thứ tự tùy ý. Nhật ký đã tìm vẫn giữ qua tải lại và không tính trùng; không thể xây công trình mới che các thùng. Đã kiểm tra vị trí/đường tiếp cận trên 100 seed, thao tác đọc và lưu/tải trong trình duyệt. Đây là nội dung khám phá bổ sung, chưa phải bằng chứng chiến dịch đạt 8–12 giờ.

Đã hoàn thành hai thử thách kết thúc bằng thời gian chạy thật và điều khiển bàn phím tự động: bè 8 phút 49 giây, cứu hộ 8 phút 1 giây. Cùng một thế giới giữ nguyên rương kiểm tra khi trở về và lưu đủ hai cờ kết thúc. Báo cáo: `ending-duration.json`. Vật tư/chương chuẩn bị được cấp trước để đo riêng thử thách; kết quả không thay thế lượt chơi toàn chiến dịch của người mới.

Phiên kiểm tra được bảo vệ đã chạy đủ 90 phút thực và 10 lần đổi thế giới: không lỗi WebGL, không tăng listener hoặc bộ đếm tài nguyên đồ họa; heap menu sau thu gom tăng khoảng 2,36 MiB. Báo cáo đầy đủ: `retention-90-minute.json`. Phiên này dùng bản build cũ trước thay đổi mặt biển/phím/khai mỏ, có bổ sung chỉ số sinh tồn để đo lưu giữ tài nguyên, nên chưa chứng minh cân bằng sinh tồn hoặc độ ổn định 90 phút của bản hiện tại.

Campaign đã có căn cứ, sản xuất, nhật ký/bản đồ, bơi/lặn, câu/móc, hang/trạm/xác tàu với va chạm theo model, quặng/tiếp tế cố định, sự kiện/động vật, nối mạch và khảo sát ba thiết bị, cùng hai thử thách kết thúc có checkpoint, thử lại, tải tiếp và quay về căn cứ. Đã có bằng chứng kiểm tra logic, thao tác trình duyệt, tải lại tiến độ và đường vào thiết bị trên 100 seed. Số liệu/lượt chạy chính xác được giữ trong `implementation-progress.md`. Vẫn cần mở rộng nội dung để đạt thời lượng, kiểm tra toàn bộ chuỗi chương/lỗi lưu, va chạm đầy đủ, tinh chỉnh hình ảnh và nghiệm thu hiệu năng/bản hiện tại/người chơi mới. Chưa coi đây là bản cập nhật hoàn chỉnh.
