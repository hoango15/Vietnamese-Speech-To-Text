import { Link } from "react-router-dom";
import { ArrowRight, AudioLines, Check, CheckCircle2, Clock3, FolderClosed } from "lucide-react";
import { canCreateProject } from "../projects/lib/permissions";
import { useResource } from "../../shared/hooks/useResource";
import { bytes, time } from "../../shared/lib/format";
import { ErrorBox, Loading, PageTitle } from "../../shared/ui/components";
import { useAuth } from "../auth/AuthProvider";
import "./dashboard.css";

export function DashboardPage() {
  const { user } = useAuth(),
    { data, error, loading, reload } = useResource<{
      stats: {
        projects: number;
        ready: number;
        processing: number;
        duration_ms: number;
        storage_bytes: number;
      };
    }>("/dashboard");
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return null;
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
      <div className="stats-grid">
        {[
          {
            label: "Tổng dự án",
            value: data.stats.projects,
            icon: FolderClosed,
            color: "teal",
            note: "Trong không gian của bạn",
          },
          {
            label: "Đã hoàn thành",
            value: data.stats.ready,
            icon: CheckCircle2,
            color: "green",
            note: "Sẵn sàng để sử dụng",
          },
          {
            label: "Đang xử lý",
            value: data.stats.processing,
            icon: Clock3,
            color: "orange",
            note: "Tiến trình đang hoạt động",
          },
          {
            label: "Thời lượng nội dung",
            value: time(data.stats.duration_ms),
            icon: AudioLines,
            color: "purple",
            note: `Đã lưu ${bytes(data.stats.storage_bytes)}`,
          },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div>
              <span>{stat.label}</span>
              <div className="stat-value">{stat.value}</div>
              <small>{stat.note}</small>
            </div>
            <div className={"stat-icon " + stat.color}>
              <stat.icon size={22} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
