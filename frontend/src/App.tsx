/**
 * 앱 라우팅 루트 컴포넌트.
 */
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ExportPage } from "./pages/ExportPage";
import { ImagesPage } from "./pages/ImagesPage";
import { SummaryPage } from "./pages/SummaryPage";
import { TranslatePage } from "./pages/TranslatePage";
import { UploadPage } from "./pages/UploadPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-full min-h-0 flex flex-col">
        <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/documents/:id/summary" element={<SummaryPage />} />
        <Route path="/documents/:id/translate" element={<TranslatePage />} />
        <Route path="/documents/:id/images" element={<ImagesPage />} />
        <Route path="/documents/:id/export" element={<ExportPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
