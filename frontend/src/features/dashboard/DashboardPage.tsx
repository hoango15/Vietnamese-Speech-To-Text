import { Link } from "react-router-dom";
import { ArrowRight, AudioLines, Check } from "lucide-react";
import { canCreateProject } from "../projects/lib/permissions";
import { PageTitle } from "../../shared/ui/components";
import { useAuth } from "../auth/AuthProvider";
import "./dashboard.css";

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <>
      <PageTitle
        title="Tổng quan"
        subtitle="Nắm bắt công việc và những cập nhật mới nhất."
      />
      <section className="welcome-banner">
        <div>
          <span className="eyebrow">KHÔNG GIAN CỦA BẠN</span>
          <h2>Xin chào, {user?.full_name.split(" ").at(-1)}!</h2>
          <p>
            Mỗi cuộc trò chuyện đều có giá trị.
            <br />
            Cùng biến những ý tưởng thành nội dung dễ dàng tìm lại.
          </p>
          <Link className="button" to="/projects">
            {canCreateProject(user?.user_role_code ?? "")
              ? "Bắt đầu một dự án"
              : "Khám phá dự án"}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-document">
            <span />
            <span />
            <span />
            <div>
              {[18, 35, 25, 48, 38, 57, 30, 44, 20].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
            <span />
          </div>
          <div className="art-check">
            <Check size={25} />
          </div>
          <AudioLines className="art-audio" size={29} />
        </div>
      </section>
    </>
  );
}
