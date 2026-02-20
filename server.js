const express = require("express");
const axios = require("axios");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static(__dirname));
app.use(express.json());

// =============================
// 自动创建 uploads 文件夹
// =============================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
fs.mkdirSync(uploadDir);
}

// =============================
// 文件上传配置
// =============================
const upload = multer({ dest: uploadDir });

// 保存解析后的数据
let uploadedFiles = {}; // { filename: [students] }

// =============================
// 上传 Excel
// =============================
app.post("/api/upload", upload.single("file"), (req, res) => {
try {
const filePath = req.file.path;
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

uploadedFiles[req.file.originalname] = data;

res.json({
  message: "上传成功",
  filename: req.file.originalname,
  count: data.length,
});
} catch (err) {
console.error(err);
res.status(500).json({ error: "解析Excel失败" });
}
});

// =============================
// 获取文件列表
// =============================
app.post("/api/files", (req, res) => {
res.json({ files: Object.keys(uploadedFiles) });
});

// =============================
// 获取文件中的学生
// =============================
app.post("/api/file-students", (req, res) => {
const { filename, level, keyword } = req.body;

if (!uploadedFiles[filename]) {
return res.status(400).json({ error: "文件不存在" });
}

let students = uploadedFiles[filename];

if (level && keyword) {
const kw = keyword.trim().toLowerCase();
if (level === "year") {
students = students.filter((s) => (s.year || "").toLowerCase() === kw);
}
if (level === "class") {
students = students.filter((s) => (s.class || "").toLowerCase() === kw);
}
}

res.json({ students });
});

// =============================
// 单个学生 AI 建议
// =============================
app.post("/api/suggest", async (req, res) => {
const { student } = req.body;

if (!student) {
return res.status(400).json({ error: "没有提供学生数据" });
}

try {
const prompt = 请根据以下体考成绩给出个性化训练建议： 姓名：${student.name} 性别：${student.gender} 总分：${student.total40} 长跑/游泳：${student.longContrib} 球类：${student.ballContrib} 选考项： ${ student.selectedProjects?.map((p) =>${p.name}: ${p.contrib}`).join("\n") ||
""
}

请生成一句话训练建议。
`;

const response = await axios.post(
  "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
  {
    model: "ep-20260219223810-rfpw9", // 你的模型ID
    messages: [{ role: "user", content: prompt }],
  },
  {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer 2a4d2870-d9fd-4e2a-93e5-6a58ea131c11",
    },
  }
);

const advice = response.data.choices?.[0]?.message?.content || "暂无建议";

res.json({ advice });
} catch (error) {
console.error(error.response?.data || error.message);
res.status(500).json({
error: error.response?.data || error.message,
});
}
});

// =============================
// 批量生成并导出Excel
// =============================
app.post("/api/export-advice", async (req, res) => {
const { students } = req.body;

if (!students || !students.length) {
return res.status(400).json({ error: "没有提供学生数据" });
}

try {
for (let student of students) {
const prompt = 请根据以下体考成绩给出个性化训练建议： 姓名：${student.name} 性别：${student.gender} 总分：${student.total40} 长跑/游泳：${student.longContrib} 球类：${student.ballContrib} 选考项： ${ student.selectedProjects?.map((p) =>${p.name}: ${p.contrib}`).join("\n") ||
""
}

请生成一句话训练建议。
`;

  const response = await axios.post(
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    {
      model: "ep-20260219223810-rfpw9",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer 2a4d2870-d9fd-4e2a-93e5-6a58ea131c11",
      },
    }
  );

  student.advice =
    response.data.choices?.[0]?.message?.content || "暂无建议";
}

const ws = XLSX.utils.json_to_sheet(students);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "体考成绩+建议");

const buffer = XLSX.write(wb, {
  type: "buffer",
  bookType: "xlsx",
});

res.setHeader(
  "Content-Disposition",
  "attachment; filename=体考成绩_训练建议.xlsx"
);
res.setHeader(
  "Content-Type",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
);

res.send(buffer);
} catch (err) {
console.error(err);
res.status(500).json({ error: err.message });
}
});

// =============================
// 启动服务器
// =============================
app.listen(process.env.PORT || 3000, () => {
console.log("服务器启动成功");
});