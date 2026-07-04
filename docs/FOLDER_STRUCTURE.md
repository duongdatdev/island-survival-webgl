# Folder Structure

Dưới đây là cấu trúc thư mục thực tế của dự án **Island Survival: Escape**:

```text
island-survival/
├── docs/                           # Tài liệu thiết kế và hướng dẫn phát triển
├── src/                            # Mã nguồn ứng dụng
│   ├── core/                       # Các module lõi điều hành game
│   │   ├── AssetManager.js         # Tải tài nguyên (Textures, Text) bất đồng bộ
│   │   ├── AudioManager.js         # Tổng hợp âm thanh lập trình (Procedural SFX/Ambient)
│   │   ├── Engine.js               # Khởi tạo WebGL & điều phối vòng lặp, scene
│   │   ├── GameLoop.js             # Quản lý nhịp cập nhật logic và dựng hình (Tick Loop)
│   │   ├── InputManager.js         # Lắng nghe sự kiện bàn phím & chuột
│   │   ├── Scene.js                # Lớp cơ sở cho các phân cảnh game
│   │   └── SceneManager.js         # Chuyển đổi và quản lý vòng đời của các Scenes
│   │
│   ├── renderer/                   # Lớp bọc WebGL 2 để dựng hình đồ họa
│   │   ├── Camera.js               # Camera góc nhìn thứ ba (Yaw, Pitch, Zoom, Follow)
│   │   ├── Light.js                # Quản lý ánh sáng Ambient và Directional (Day/Night)
│   │   ├── Mesh.js                 # Quản lý buffers hình học (Vertex, Index, UV, Normal)
│   │   ├── ShaderProgram.js        # Biên dịch và liên kết Vertex & Fragment Shaders
│   │   └── Texture.js              # Khởi tạo và thiết lập thuộc tính WebGL Texture
│   │
│   ├── entities/                   # Các đối tượng hiển thị & tương tác trong thế giới
│   │   ├── Entity.js               # Lớp cơ sở cho thực thể (Transform, Matrix)
│   │   ├── Player.js               # Thực thể người chơi (Movement, Physics snap, Rotation)
│   │   ├── Terrain.js              # Tạo lưới địa hình đảo bằng thuật toán
│   │   ├── Water.js                # Mặt nước biển động với sóng lập trình
│   │   ├── WorldResource.js        # Tài nguyên trên đảo (Cây cối, bãi đá nhặt được)
│   │   ├── DriftingDebris.js       # Thùng gỗ, chai nước, dây thừng trôi nổi trên biển
│   │   └── RaftAssembly.js         # Cụm bè ghép linh hoạt tại bãi biển lắp ráp
│   │
│   ├── systems/                    # Các hệ thống phụ trợ quản lý logic và trạng thái
│   │   ├── Inventory.js            # Quản lý số lượng vật phẩm và phát sự kiện thay đổi
│   │   ├── CraftingSystem.js       # Kiểm tra công thức & tiến hành tiêu hao chế tạo
│   │   ├── ResourceManager.js      # Quản lý vòng đời spawn, thu thập các tài nguyên trên đảo
│   │   ├── DebrisManager.js        # Quản lý spawn, chuyển động dòng chảy và nhặt mảnh vỡ
│   │   ├── ParticleSystem.js       # Tạo hiệu ứng hạt (Dust, Splash, Pickup, Build)
│   │   ├── TutorialSystem.js       # Quản lý trình tự hướng dẫn người chơi mới
│   │   ├── ResourceDatabase.js     # Cơ sở dữ liệu thuộc tính của tài nguyên
│   │   ├── RecipeDatabase.js       # Định nghĩa công thức chế tạo vật phẩm
│   │   └── DebrisDatabase.js       # Định nghĩa thông số các loại mảnh vỡ trôi nổi
│   │
│   ├── shaders/                    # Các tập tin mã nguồn GLSL shader dạng JS
│   │   ├── BasicShader.js          # Shader cơ bản có Blinn-Phong lighting + Textures
│   │   ├── WaterShader.js          # Shader chuyển động sóng biển động sinh động
│   │   └── ParticleShader.js       # Shader tối ưu để render lượng hạt lớn dạng Billboard
│   │
│   ├── scenes/                     # Các màn chơi (Cảnh) riêng biệt trong game
│   │   ├── LoadingScene.js         # Màn hình tải dữ liệu giả lập và lời khuyên
│   │   ├── MainMenuScene.js        # Menu bắt đầu có tương tác nút bấm
│   │   └── GameScene.js            # Trải nghiệm chơi game chính, liên kết tất cả hệ thống
│   │
│   └── main.js                     # Điểm khởi đầu (Bootstrap) ứng dụng
│
├── index.html                      # Tệp HTML5 khung chứa Canvas & lớp giao diện UI
├── index.css                       # Kiểu giao diện hiện đại (Glassmorphism, Neon glow)
└── README.md                       # Giới thiệu sơ lược dự án
```
