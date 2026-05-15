# 飞书多维表格 - 5张表字段定义

---

## 表1: users（用户表）

| 字段名 | 字段类型 | 属性/选项 | 说明 |
|--------|----------|-----------|------|
| `openid` | 文本 | — | 微信openid，登录时自动写入 |
| `name` | 文本 | — | 用户姓名 |
| `avatar_url` | 文本 | — | 头像URL，可空 |
| `role` | 多选 | `admin` / `warehouse_admin` / `borrower` | 角色（可多选）：同一个人可同时为仓库管理员和借用人员 |
| `status` | 单选 | `pending` / `pending_review` / `active` / `inactive` | pending=新注册 / pending_review=已申请待审批 / active=正常 / inactive=已禁用 |
| `created_at` | 数字 | 整数 | 创建时间（毫秒时间戳） |

---

## 表2: categories（货物类型表）

| 字段名 | 字段类型 | 属性/选项 | 说明 |
|--------|----------|-----------|------|
| `name` | 文本 | — | 类型名称，如"电子产品" |
| `description` | 文本 | — | 描述，可空 |
| `created_at` | 数字 | 整数 | 创建时间（毫秒时间戳） |

---

## 表3: items（货物/库存表）

| 字段名 | 字段类型 | 属性/选项 | 说明 |
|--------|----------|-----------|------|
| `name` | 文本 | — | 货物名称 |
| `category_id` | 文本 | — | 关联 categories 表的记录ID（recXXXX） |
| `category_name` | 文本 | — | 类型名称冗余，方便查询显示 |
| `total_quantity` | 数字 | 整数 | 总库存数量 |
| `available_quantity` | 数字 | 整数 | 当前可用数量 |
| `borrowed_quantity` | 数字 | 整数 | 已借出数量 |
| `description` | 文本 | — | 描述，可空 |
| `image_url` | 文本 | — | 货物图片 fileID，可空 |
| `status` | 单选 | `active` / `inactive` | 在库/停用 |
| `created_at` | 数字 | 整数 | 创建时间（毫秒时间戳） |

---

## 表4: borrow_records（借用记录表）

| 字段名 | 字段类型 | 属性/选项 | 说明 |
|--------|----------|-----------|------|
| `item_id` | 文本 | — | 关联 items 表记录ID |
| `item_name` | 文本 | — | 货物名称冗余 |
| `borrower_id` | 文本 | — | 借用人 openid |
| `borrower_name` | 文本 | — | 借用人姓名冗余 |
| `quantity` | 数字 | 整数 | 借用数量 |
| `status` | 单选 | `pending_approval` / `approved` / `rejected` / `collected` / `returned` | 流程状态 |
| `apply_remark` | 文本 | — | 申请备注，可空 |
| `apply_time` | 数字 | 整数 | 申请时间（毫秒时间戳） |
| `apply_photo` | 文本 | — | 借用人领取拍照（云存储 fileID），可空 |
| `approver_id` | 文本 | — | 审批人 openid |
| `approver_name` | 文本 | — | 审批人姓名 |
| `approve_time` | 数字 | 整数 | 审批时间戳，可空 |
| `reject_reason` | 文本 | — | 驳回原因，可空 |
| `collect_time` | 数字 | 整数 | 领取确认时间戳，可空 |
| `collect_photo` | 文本 | — | 领取留档照片，可空 |
| `collect_operator` | 文本 | — | 领取确认人，可空 |
| `return_time` | 数字 | 整数 | 归还时间戳，可空 |
| `return_photo` | 文本 | — | 归还留档照片，可空 |
| `return_operator` | 文本 | — | 归还确认人，可空 |

---

## 表5: inventory_logs（库存变更记录表）

| 字段名 | 字段类型 | 属性/选项 | 说明 |
|--------|----------|-----------|------|
| `item_id` | 文本 | — | 关联 items 表记录ID |
| `item_name` | 文本 | — | 货物名称冗余 |
| `change_type` | 单选 | `stock_in` / `stock_out` / `adjust` / `borrow` / `return` | 入库/出库/盘点/借出/归还 |
| `quantity` | 数字 | 整数 | 变更数量 |
| `before_quantity` | 数字 | 整数 | 变更前可用数量 |
| `after_quantity` | 数字 | 整数 | 变更后可用数量 |
| `reason` | 文本 | — | 变更原因，可空 |
| `operator_id` | 文本 | — | 操作人 openid |
| `operator_name` | 文本 | — | 操作人姓名 |
| `created_at` | 数字 | 整数 | 操作时间（毫秒时间戳） |

---

## 注意事项

- **数字**字段全部设为整数，不要小数
- **单选**字段选项值用英文（代码按英文值判断），不要用中文
- 时间统一用**毫秒时间戳数字**（`Date.now()` 格式），不用飞书的日期字段
- 建完每张表后复制其 `tblXXXX` ID，填入 `cloudfunctions/feishuConfig.json`
- 照片由自建服务器存储，飞书表里用**文本字段**存照片 URL 字符串（如 `https://your-domain.com/uploads/2026/05/xxx.jpg`）
