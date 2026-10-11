# Công thức và xây dựng Campaign

Tạo lại từ dữ liệu đang dùng bằng `node scripts/document-campaign-recipes.mjs`. Bảng áp dụng cho Campaign; công thức trùng mã của Classic được thay bằng bản Campaign.

Cấp 1 có từ đầu. Hoàn thành chương 2 mở cấp 2; hoàn thành chương 4 mở cấp 3. Bản thiết kế là điều kiện bổ sung khi được ghi trong bảng. Công thức không có thời gian được chế tạo ngay.

Đứng trong 3 m của trạm cần dùng. Nguyên liệu lấy từ túi và các rương đồng ý chia sẻ trong 5 m. Lò nung/giàn hun khói có tối đa 5 lượt: đặt lượt sẽ giữ nguyên liệu; hết nhiên liệu hoặc đầy kho thành phẩm thì tạm dừng. Hủy lượt chưa hoàn thành trả nguyên liệu nếu túi đủ chỗ.

Một gỗ cấp 120 giây nhiên liệu, một than củi cấp 300 giây. Lửa không có mái che giảm hiệu quả khi mưa. Thời gian dưới đây là thời gian xử lý khi đủ nhiên liệu và hoạt động hết hiệu quả; không tiến triển khi đóng game.

## Chế tạo

| Mã | Công thức | Cấp | Trạm | Giây/lượt | Giây nhiên liệu tối thiểu | Nguyên liệu | Thành phẩm | Bản thiết kế |
|---|---|---:|---|---:|---:|---|---|---|
| shelter | Mái trú ẩn | 1 | Bằng tay | 0 | 0 | Gỗ ×6, Dây Thừng ×2 | Mái Trú Ẩn ×1 | — |
| stone_axe | Rìu Đá | 1 | Bằng tay | 0 | 0 | Gỗ ×2, Đá ×2 | Rìu Đá ×1 | — |
| campfire | Lửa trại | 1 | Bằng tay | 0 | 0 | Đá ×4, Gỗ ×3 | Lửa Trại ×1 | — |
| water_collector | Bồn hứng nước | 1 | Bằng tay | 0 | 0 | Gỗ ×4, Thùng Gỗ ×1 | Bẫy Nước Mưa ×1 | — |
| raft_frame | Khung Bè | 1 | Bằng tay | 0 | 0 | Gỗ ×10 | Khung Bè ×1 | — |
| paddle | Mái Chèo | 1 | Bằng tay | 0 | 0 | Gỗ ×5, Dây Thừng ×2 | Mái Chèo ×1 | — |
| barrel_floats | Phao Thùng | 1 | Bằng tay | 0 | 0 | Thùng Gỗ ×3, Dây Thừng ×1 | Phao Thùng ×1 | — |
| fishing_rod | Cần Câu | 1 | Bằng tay | 0 | 0 | Gỗ ×3, Dây Thừng ×2 | Cần Câu ×1 | fishing_rod_blueprint |
| raft_sail | Cánh Buồm | 1 | Bằng tay | 0 | 0 | Gỗ ×3, Dây Thừng ×2, Vải Buồm ×1 | Cánh Buồm ×1 | sail_raft_blueprint |
| raft_motor | Động Cơ Bè | 1 | Bằng tay | 0 | 0 | Gỗ ×5, Dây Thừng ×2, Phụ Tùng Động Cơ ×2 | Động Cơ Bè ×1 | motor_raft_blueprint |
| spear | Giáo | 1 | Bằng tay | 0 | 0 | Gỗ ×3, Dây Thừng ×1 | Giáo ×1 | — |
| bow | Cung | 1 | Bằng tay | 0 | 0 | Gỗ ×3, Dây Thừng ×2 | Cung ×1 | — |
| arrow | Tên (x3) | 1 | Bằng tay | 0 | 0 | Gỗ ×1, Đá ×1 | Tên ×3 | — |
| bandage | Băng Gạc | 1 | Bằng tay | 0 | 0 | Thảo Dược ×2 | Băng Gạc ×1 | — |
| rope | Dây thừng | 1 | Bằng tay | 0 | 0 | Sợi thực vật ×3 | Dây Thừng ×1 | — |
| unravel_rope | Tách sợi dây thừng | 1 | Bằng tay | 0 | 0 | Dây Thừng ×1 | Sợi thực vật ×3 | — |
| barrel | Thùng gỗ | 2 | Bàn chế tạo | 0 | 0 | Gỗ ×8, Dây Thừng ×1, Thỏi sắt ×1 | Thùng Gỗ ×1 | — |
| hook | Móc kéo | 1 | Bằng tay | 0 | 0 | Gỗ ×2, Đá ×2, Dây Thừng ×2 | Móc kéo ×1 | — |
| torch | Đuốc | 1 | Bằng tay | 0 | 0 | Gỗ ×2, Sợi thực vật ×2 | Đuốc ×1 | — |
| stone_pickaxe | Cuốc đá | 1 | Bằng tay | 0 | 0 | Gỗ ×3, Đá ×4, Dây Thừng ×1 | Cuốc đá ×1 | — |
| iron_axe | Rìu sắt | 2 | Bàn chế tạo | 0 | 0 | Thỏi sắt ×3, Gỗ ×3, Dây Thừng ×1 | Rìu sắt ×1 | — |
| iron_pickaxe | Cuốc sắt | 2 | Bàn chế tạo | 0 | 0 | Thỏi sắt ×3, Gỗ ×3, Dây Thừng ×1 | Cuốc sắt ×1 | — |
| iron_ingot | Nung sắt | 2 | Lò nung | 45 | 45 | Quặng sắt ×2 | Thỏi sắt ×1 | — |
| copper_ingot | Nung đồng | 2 | Lò nung | 50 | 50 | Quặng đồng ×2 | Thỏi đồng ×1 | — |
| charcoal | Than củi | 2 | Lò nung | 30 | 30 | Gỗ ×3 | Than củi ×2 | — |
| copper_wire | Dây đồng | 3 | Bàn sửa chữa | 0 | 0 | Thỏi đồng ×1 | Dây đồng ×3 | — |
| battery | Pin sửa chữa | 3 | Bàn sửa chữa | 0 | 0 | Phế liệu ×3, Thỏi đồng ×2, Thỏi sắt ×1 | Pin sửa chữa ×1 | — |
| dive_kit | Bộ lặn | 3 | Bàn sửa chữa | 0 | 0 | Thỏi sắt ×4, Phế liệu ×4, Dây Thừng ×2 | Bộ lặn ×1 | — |
| radio | Radio cứu hộ | 3 | Bàn sửa chữa | 0 | 0 | Phế liệu ×6, Dây đồng ×4, Pin sửa chữa ×1 | Radio cứu hộ ×1 | — |
| compass | La bàn dẫn đường | 3 | Bàn sửa chữa | 0 | 0 | Thỏi sắt ×2, Thỏi đồng ×1 | La bàn dẫn đường ×1 | — |
| repair_kit | Bộ sửa chữa | 3 | Bàn sửa chữa | 0 | 0 | Gỗ ×3, Sợi thực vật ×2, Phế liệu ×1 | Bộ sửa chữa ×1 | — |
| smoked_meal | Thức ăn hun khói | 1 | Giàn hun khói | 90 | 90 | Cá Sống ×1 | Thức ăn hun khói ×1 | — |
| smoke_boar | Hun khói thịt lợn | 1 | Giàn hun khói | 90 | 90 | Thịt Lợn Rừng Sống ×1 | Thức ăn hun khói ×1 | — |
| smoke_reef | Hun khói cá rạn | 1 | Giàn hun khói | 90 | 90 | Cá rạn ×1 | Thức ăn hun khói ×1 | — |
| smoke_ocean | Hun khói cá lớn | 1 | Giàn hun khói | 120 | 120 | Cá biển lớn ×1 | Thức ăn hun khói ×2 | — |
| bed | Giường nghỉ | 1 | Bằng tay | 0 | 0 | Gỗ ×5, Dây Thừng ×2, Sợi thực vật ×4 | Giường nghỉ ×1 | — |
| chest | Rương nhỏ | 1 | Bằng tay | 0 | 0 | Gỗ ×6, Dây Thừng ×1 | Rương nhỏ ×1 | — |
| large_chest | Rương lớn | 2 | Bằng tay | 0 | 0 | Gỗ ×10, Thỏi sắt ×2 | Rương lớn ×1 | — |
| workbench | Bàn chế tạo | 1 | Bằng tay | 0 | 0 | Gỗ ×8, Đá ×3 | Bàn chế tạo ×1 | — |
| smelter | Lò nung | 2 | Bằng tay | 0 | 0 | Đá ×12, Gỗ ×4 | Lò nung ×1 | — |
| repair_bench | Bàn sửa chữa | 3 | Bằng tay | 0 | 0 | Gỗ ×8, Thỏi sắt ×4, Phế liệu ×3 | Bàn sửa chữa ×1 | — |
| planter | Luống trồng | 1 | Bằng tay | 0 | 0 | Gỗ ×6, Sợi thực vật ×2 | Luống trồng ×1 | — |
| smoker | Giàn hun khói | 1 | Bằng tay | 0 | 0 | Gỗ ×6, Dây Thừng ×2, Đá ×3 | Giàn hun khói ×1 | — |
| fish_trap | Bẫy cá | 1 | Bằng tay | 0 | 0 | Gỗ ×3, Dây Thừng ×2, Sợi thực vật ×4 | Bẫy cá ×1 | — |
| large_water_collector | Bồn nước nâng cấp | 2 | Bằng tay | 0 | 0 | Gỗ ×8, Thùng Gỗ ×2, Thỏi sắt ×2 | Bồn nước nâng cấp ×1 | — |

## Xây dựng

Vật dụng có công thức trong bảng trên được đặt bằng chế độ xây dựng. Bộ phận nhà dùng nguyên liệu trực tiếp. Lưới 2 m, xoay 90°. Giới hạn 400 bộ phận nhà và 80 vật dụng chức năng; tháo dỡ hợp lệ trả phần nguyên liệu đã làm tròn xuống ở mức 75%.

| Mã | Công trình | Cấp | Nguyên liệu | Phụ thuộc | Ô chứa |
|---|---|---:|---|---|---:|
| foundation | Móng gỗ | 1 | Gỗ ×4 | — | 0 |
| floor | Sàn gỗ | 1 | Gỗ ×3 | foundation | 0 |
| wall | Tường gỗ | 1 | Gỗ ×3 | foundation | 0 |
| doorway | Khung cửa | 1 | Gỗ ×3 | foundation | 0 |
| door | Cửa gỗ | 1 | Gỗ ×2, Dây Thừng ×1 | doorway | 0 |
| roof | Mái gỗ | 1 | Gỗ ×3, Sợi thực vật ×2 | foundation | 0 |
| shelter | Mái trú ẩn | 1 | Gỗ ×6, Dây Thừng ×2 | — | 0 |
| campfire | Lửa trại | 1 | Đá ×4, Gỗ ×3 | — | 0 |
| water_collector | Bồn hứng nước | 1 | Gỗ ×4, Thùng Gỗ ×1 | — | 0 |
| bed | Giường nghỉ | 1 | Gỗ ×5, Dây Thừng ×2, Sợi thực vật ×4 | — | 0 |
| chest | Rương nhỏ | 1 | Gỗ ×6, Dây Thừng ×1 | — | 24 |
| large_chest | Rương lớn | 2 | Gỗ ×10, Thỏi sắt ×2 | — | 48 |
| workbench | Bàn chế tạo | 1 | Gỗ ×8, Đá ×3 | — | 0 |
| smelter | Lò nung | 2 | Đá ×12, Gỗ ×4 | — | 8 |
| repair_bench | Bàn sửa chữa | 3 | Gỗ ×8, Thỏi sắt ×4, Phế liệu ×3 | — | 0 |
| planter | Luống trồng | 1 | Gỗ ×6, Sợi thực vật ×2 | — | 0 |
| smoker | Giàn hun khói | 1 | Gỗ ×6, Dây Thừng ×2, Đá ×3 | — | 8 |
| fish_trap | Bẫy cá | 1 | Gỗ ×3, Dây Thừng ×2, Sợi thực vật ×4 | — | 4 |
| large_water_collector | Bồn nước nâng cấp | 2 | Gỗ ×8, Thùng Gỗ ×2, Thỏi sắt ×2 | — | 0 |
