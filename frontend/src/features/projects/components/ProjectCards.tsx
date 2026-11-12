import { Link } from "react-router-dom";
import { Clock3, Users } from "lucide-react";
import type { Project } from "../../../shared/types";
import { date } from "../../../shared/lib/format";
import { FileIcon, Status } from "../../../shared/ui/components";

export function ProjectCards({ projects }: { projects: Project[] }) {
  return (
    <div className="project-grid">
      {projects.map((project) => (
        <Link
          className="project-card"
          to={"/projects/" + project.project_id}
          key={project.project_id}
        >
          <div className="project-card-top">
            <FileIcon kind={project.media_kind} />
            <Status code={project.project_status_code} />
          </div>
          <h3>{project.project_title}</h3>
          <p>{project.project_description || "Chưa có mô tả dự án."}</p>
          {project.project_status_code === "PROCESSING" && (
            <div
              className="progress"
              role="progressbar"
              aria-label={"Tiến độ " + project.project_title}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={project.progress_percent ?? 0}
            >
              <span style={{ width: `${project.progress_percent ?? 0}%` }} />
            </div>
          )}
          <div className="project-card-bottom">
            <span>
              <Clock3 size={14} />
              {date(project.updated_at)}
            </span>
            <span>
              <Users size={14} />
              {project.member_count} thành viên
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
