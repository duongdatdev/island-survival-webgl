# Game Rules & Controls

Stranded on a small tropical island, your goal is to survive long enough to gather resources, craft raft components, assemble a raft at the shore, and escape the island.

---

## 🎮 Game Controls

| Key / Control | Action | Notes |
| :--- | :--- | :--- |
| **W, A, S, D** | Character Movement | Relative to the camera's orientation. |
| **Space** | Jump | Press while grounded; release before jumping again. Rebind in Settings → Controls. |
| **Shift + Movement** | Sprint | 4.4 m/s while stamina lasts; walking regenerates stamina. |
| **Left Click + Drag** | Orbit Camera | Rotates the camera view around the player character. |
| **Mouse Wheel** | Zoom Camera | Adjusts distance between camera and player. |
| **E Key** | Pick Up / Interact | Collects nearby resources or installs raft modules. |
| **Tab Key** | Toggle Inventory HUD | Hides/shows the bottom-left inventory HUD panel. |
| **C Key** | Toggle Crafting | Opens/closes the crafting panel. |
| **L Key** | Lock Mouse Cursor | Locks mouse to screen for direct camera look. |
| **ESC Key** | Pause Game | Pauses action, toggles sound, or exits to menu. |
| **F3 Key** | Toggle Debug Panel | Displays technical readouts (FPS, Coords, Wireframe). |
| **K Key (Cheat)** | Developer Cheat | Teleports to beach and gives all 3 raft modules. |

---

## 🪵 Resource Gathering

There are two primary ways to gather materials:

### 1. Island Resources
Spawned on the island terrain at the beginning of the session:
*   **Wood 🪵:** Collected from fallen branches around palm trees.
*   **Stone 🪨:** Collected from pebbles lying near large rock clusters.

### 2. Floating Debris
Spawns out in the ocean and drifts toward the shore:
*   **Wood 🪵 / Stone 🪨:** Drifts onto the beach to ensure players never run out of materials once the island resources are exhausted.
*   **Rope 🪢:** Vital for tying raft components together.
*   **Barrel 🛢️:** Used as floats under the raft frame.

---

## 🔨 Crafting Recipes

Press **C** to open the crafting UI. If you have the required ingredients, the craft button becomes active:

1.  **Stone Axe 🪓**
    *   *Recipe:* 2 Wood + 2 Stone
    *   *Purpose:* Standard tool (serves as a milestone requirement in the tutorial sequence).
2.  **Raft Frame 🧱**
    *   *Recipe:* 10 Wood
    *   *Purpose:* The foundational base platform of the raft.
3.  **Barrel Floats 🛢️**
    *   *Recipe:* 3 Barrel + 1 Rope
    *   *Purpose:* High-buoyancy floats attached underneath the frame.
4.  **Paddle 🛶**
    *   *Recipe:* 5 Wood + 2 Rope
    *   *Purpose:* Propulsion tool needed to sail and navigate the ocean.

---

## ⛵ Raft Construction & Escaping

Once you have crafted the **Raft Frame**, **Barrel Floats**, and **Paddle**, head to the southern beach of the island. You will see a reddish wireframe raft silhouette floating near the shore.

1.  **Place the Frame:** Stand near the red silhouette and press **E**. The wooden platform frame will materialize.
2.  **Place the Floats:** Stand near the frame and press **E** to attach the barrels underneath.
3.  **Place the Paddle:** Stand near the raft and press **E** to mount the steering paddle.
4.  **Escape:** When all components are placed, the "Escape" prompt will appear. Click the button to start the victory cutscene. The camera transitions to a cinematic view as your character boards the raft and sails away, ending the game and displaying your total survival time.


## Mái trú ẩn và ngủ qua đêm

- Chế tạo **Mái Trú Ẩn** trong nhóm **Sinh tồn** bằng **8 Gỗ + 2 Dây Thừng**.
- Chọn mái trên hotbar, nhấn **Q** để dựng trước mặt trên nền đất khô, tương đối bằng phẳng. Mỗi thế giới có một mái.
- Đứng bên dưới mái để tránh ướt do mưa và giảm 75% mất nhiệt trực tiếp do đêm lạnh. Mái không làm khô ngay quần áo đã ướt và không bảo vệ khi ngâm nước.
- Lửa trại đặt dưới mái không bị mưa làm yếu. Đứng gần lửa giúp sưởi và hong khô.
- Ban đêm, đứng dưới mái và nhấn **E** để ngủ tới bình minh. Lời nhắc hiển thị chi phí đói/khát; ngủ dùng 35% mức tiêu hao khi thức và hồi thể lực theo thời gian nghỉ.
- Cần giữ lại hơn 5 điểm đói và khát sau khi ngủ, nhiệt ít nhất 40, độ ướt không quá 40. Không ngủ khi có thú nguy hiểm trong phạm vi ít nhất 12 m, đang câu cá, ở dưới nước hoặc đang thoát đảo.
- Thời tiết, thu nước mưa và thân nhiệt vẫn tiến triển khi ngủ. Sinh vật không mô phỏng di chuyển trong khoảng thời gian được bỏ qua.
- Khi có thể ngủ, E ưu tiên hành động ngủ dưới mái. Ra ngoài vùng mái để dùng tương tác khác, hoặc nấu/hong khô trước khi đủ điều kiện ngủ.
- Mái được lưu cùng thế giới; bản lưu cũ mặc định chưa xây mái. Game tự lưu sau khi thức dậy.
