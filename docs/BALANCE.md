# Cân bằng sinh tồn — 17/09/2026

Mục tiêu: khám phá và dựng trại trước khi áp lực sinh tồn tăng; săn thú có lợi nhưng vẫn cần chuẩn bị. Đây là bộ chỉ số mặc định, cần chơi thử để đánh giá cảm giác và độ khó thực tế.

## Di chuyển và sinh tồn

| Chỉ số | Giá trị |
| --- | --- |
| Đi bộ / chạy | 3,2 / 4,8 đơn vị mỗi giây |
| Chạy từ đầy thể lực | 8,33 giây, khoảng 40 đơn vị trước khi tính gia tốc |
| Hồi đầy thể lực | 6,25 giây khi không lạnh |
| Mở lại chạy sau kiệt sức | 20 thể lực, tương đương 1,25 giây hồi bình thường |
| Đói / khát mất mỗi phút | 4,8 / 7,2 |
| Cạn từ đầy, không ăn uống | Đói 20 phút 50 giây; khát 13 phút 53 giây |
| Mất máu khi đói hoặc khát bằng 0 | 0,6 HP/giây; không cộng đôi khi cả hai cạn |
| Dừa / thức ăn chín / nước / băng | +15 khát / +40 đói / +50 khát / +25 HP |

Dừa có thể dùng trực tiếp để cứu khát hoặc đem nấu như trước. Một bữa chín bù khoảng 8 phút 20 giây đói; một phần nước bù khoảng 6 phút 57 giây khát. Không có hồi máu thụ động. Chu kỳ ngày vẫn là 10 phút để tránh thay đổi nhịp ngủ và thời tiết cùng lúc.

## Chiến đấu

| Vũ khí | Sát thương | Tầm | Hồi chiêu | Số đòn hạ lợn 55 HP |
| --- | --- | --- | --- | --- |
| Tay không | 5 | 1,4 | 0,42 giây | 11 |
| Rìu | 14 | 2 | 0,54 giây | 4 |
| Giáo | 22 | 2,6 | 0,8 giây | 3 |
| Cung | 10–28 | Đạn vật lý | 0,35 giây sau bắn; kéo đầy 1 giây | 2 khi kéo đầy |

Rìu là công cụ kiêm tự vệ; giáo có lợi thế tầm đánh; cung đổi tên và thời gian kéo lấy an toàn. Lợn gây 12 HP/đòn, tầm 1,2, hồi chiêu 2,4 giây. Báo hiệu lao kéo dài 0,7 giây và không gây sát thương tiếp xúc trong giai đoạn đó. Cá mập có 70 HP, gây 16 HP/đòn, tầm 1,7, hồi chiêu 3 giây; cần 4 nhát giáo hoặc 3 tên kéo đầy.

## Trại và môi trường

- Mái trú: 6 gỗ + 2 dây; lửa trại: 3 gỗ + 4 đá.
- Hứng nước: 4 gỗ + 1 thùng; băng: 2 thảo dược.
- Giữ giá bè và nâng cấp, sản lượng nhặt/chặt cây, lượng thịt và tốc độ hứng nước. Giảm chi phí trại giúp đầu tư sinh tồn bớt cạnh tranh với vật liệu thoát đảo.
- Mưa tăng ướt 0,6/giây; đêm khô 0,18/giây; lạnh do ướt tối đa 0,25/giây. Sát thương rét tối đa 0,35 HP/giây. Lửa và mái trú vẫn cần thiết cho các chuyến đi mưa dài.

## Kiểm chứng

`npm test` kiểm tra cửa sổ chạy/thoát, ngân sách số đòn, cứu khát, báo hiệu lao, chết ngay khi trúng đòn chí mạng, tính nhất quán theo bước thời gian và các hệ thống hiện có. `npm run build` kiểm tra bản production.

Chưa xác nhận bằng chơi thử tương tác. Khi thử, ưu tiên ba tình huống: dựng trại trong 5 phút đầu, săn lợn bằng từng vũ khí, và quay về trại sau một đợt mưa đêm. Chỉnh thông số chiến đấu/sinh tồn/thời tiết ở `src/gameplay/BalanceConfig.js`; giá chế tạo ở `RecipeDatabase.js`, hiệu ứng đồ dùng ở `ResourceDatabase.js`.
