# Kiểm thử thời lượng với người chơi mới

Trạng thái: chưa có lượt chơi người thật nào được ghi nhận. Kiểm thử tự động, phiên chạy dài và số giờ mô phỏng không thay thế kết quả này.

Người dùng đã nhận chơi thử trước (P01), ngày 11/10/2026. Đây là xác nhận tham gia, chưa phải một phiên chơi hoặc kết quả thời lượng. Bản thử dùng bản sao production cố định, phục vụ tại `http://127.0.0.1:4173/`; thông tin bundle/hash/PID nằm ở `.cache/playtest/current.json`. Giữ cùng địa chỉ này giữa các phiên để tiếp tục đúng dữ liệu trình duyệt.

## Phạm vi

Năm người chưa từng chơi bản Campaign thực hiện chiến dịch từ thế giới mới đến kết thúc đầu tiên. Mục tiêu cần đánh giá là trung vị 8–12 giờ chơi chủ động, trải qua nhiều phiên trong khoảng 5–7 ngày ngoài đời. Người chơi tự sắp xếp phiên; game luôn cho phép tiếp tục ngay khi muốn.

Dùng bản build được chỉ định và độ khó Tiêu chuẩn. Ghi tên bundle, seed, trình duyệt, máy và thiết lập đồ họa trước khi bắt đầu. Mỗi người dùng một thế giới riêng và giữ lại thế giới đó giữa các phiên.

## Cách thực hiện

1. Người chơi tự tạo thế giới, đọc hướng dẫn và chọn cách tiến hành. Người quan sát ghi lại điểm vướng, số lần cần gợi ý và cách người chơi hiểu mục tiêu tiếp theo.
2. Mỗi phiên dự kiến 45–90 phút. Người chơi có thể nghỉ hoặc kết thúc phiên bất cứ lúc nào; lưu và tải tiếp ở phiên sau.
3. Ghi thời điểm bắt đầu/kết thúc từng phiên và các khoảng nghỉ. Thời gian suy nghĩ, đọc ghi chép, xây căn cứ và giải thiết bị thuộc thời gian chơi chủ động. Trừ thời gian rời máy, xử lý lỗi kỹ thuật và nghỉ ngoài game.
4. Ghi chương đạt được, khám phá chính, số lần chết, chỗ bị kẹt và hoạt động người chơi thấy lặp lại. Khi cần gợi ý cách chơi, ghi rõ nội dung và thời điểm.
5. Sau kết thúc đầu tiên, xuất bản sao thế giới để giữ bằng chứng. Thử tiếp tục căn cứ và tuyến kết thúc còn lại; ghi riêng thời gian này.

`campaign.playSeconds` hỗ trợ đối chiếu: thời gian mô phỏng, thử thách kết thúc và bảng gameplay được cộng; ngủ tua nhanh, menu tạm dừng, tab ẩn và màn hình kết quả không cộng. Đồng hồ không tự nhận biết người đứng yên rời máy, vì vậy nhật ký phiên vẫn cần các khoảng nghỉ thực tế.

## Nhật ký mỗi phiên

| Trường | Nội dung cần ghi |
|---|---|
| Người / phiên / ngày | Mã người chơi; số phiên; ngày ngoài đời |
| Build / seed / máy | Bundle; seed; CPU/GPU/RAM; trình duyệt; thiết lập |
| Giờ bắt đầu / kết thúc | Đồng hồ thực tế và `playSeconds` đầu/cuối |
| Nghỉ / lỗi kỹ thuật | Số phút và lý do |
| Thời gian chủ động | Tổng phiên trừ các khoảng nghỉ/lỗi |
| Tiến trình | Chương đầu/cuối; mốc đạt được; tọa độ hoặc địa điểm |
| Vướng / trợ giúp | Cách tái hiện; nội dung gợi ý; số phút bị kẹt |
| Cảm nhận | Hoạt động thú vị; đoạn lặp lại; lý do muốn quay lại |
| Lưu / tải | Đồ, căn cứ, nhiệm vụ và vị trí có giữ đúng qua phiên sau |

## Bảng kết quả

| Người | Phiên đã chơi | Giờ chủ động tới kết thúc đầu | Tuyến kết thúc | Tình trạng |
|---|---:|---:|---|---|
| P01 | — | — | — | Người dùng nhận chơi thử trước; chưa có nhật ký phiên |
| P02 | — | — | — | Chưa chơi |
| P03 | — | — | — | Chưa chơi |
| P04 | — | — | — | Chưa chơi |
| P05 | — | — | — | Chưa chơi |

Chỉ tính trung vị sau khi có ít nhất năm lượt hợp lệ hoàn thành. Sắp xếp năm thời lượng và lấy giá trị ở giữa. Lưu cả dữ liệu từng người, số lần gợi ý và các lượt chưa hoàn thành để tránh che khuất đoạn quá khó hoặc nhàm chán.

Nếu thời lượng quá ngắn, bổ sung khám phá, quyết định và hoạt động có mục đích tại chương thiếu nội dung. Nếu quá dài vì lặp thao tác, đi vòng hoặc khó hiểu, sửa chính nguyên nhân đó. Đánh giá lại bằng lượt chơi mới sau thay đổi lớn. Hiện chưa đạt điều kiện nghiệm thu thời lượng.
