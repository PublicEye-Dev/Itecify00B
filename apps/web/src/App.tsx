import { WorkspaceCollabProvider } from "./lib/collab/WorkspaceCollabProvider.js";
import { WorkspaceCollabLayout } from "./features/files/WorkspaceCollabLayout.js";
import { useWorkspaceId } from "./useWorkspaceId.js";

export function App() {
  const workspaceId = useWorkspaceId();

  return (
    <WorkspaceCollabProvider workspaceId={workspaceId}>
      <WorkspaceCollabLayout workspaceId={workspaceId} />
    </WorkspaceCollabProvider>
  );
}
