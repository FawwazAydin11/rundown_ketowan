import type {
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

export type ProjectRole =
  | "owner"
  | "editor"
  | "participant";

export type RundownProject = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  role: ProjectRole;
};

type ProjectRow = Omit<RundownProject, "role">;

const PROJECT_COLUMNS = `
  id,
  name,
  description,
  owner_id,
  created_at,
  updated_at
`;

async function getProjectRole(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  ownerId: string,
): Promise<ProjectRole> {
  if (ownerId === userId) {
    return "owner";
  }

  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Gagal membaca role pengguna: ${error.message}`,
    );
  }

  return (data?.role as ProjectRole | undefined) ??
    "participant";
}

export async function getOrCreateDefaultProject(
  supabase: SupabaseClient,
  user: User,
): Promise<RundownProject> {
  /*
   * Karena RLS aktif, hasil query hanya berisi proyek
   * yang memang boleh dilihat pengguna ini.
   */
  const {
    data: existingProject,
    error: selectError,
  } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", {
      ascending: true,
    })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Gagal membaca proyek: ${selectError.message}`,
    );
  }

  if (existingProject) {
    const project = existingProject as ProjectRow;

    const role = await getProjectRole(
      supabase,
      project.id,
      user.id,
      project.owner_id,
    );

    return {
      ...project,
      role,
    };
  }

  const {
    data: createdProject,
    error: insertError,
  } = await supabase
    .from("projects")
    .insert({
      name: "Keluarga Ketowan",
      description:
        "Rundown kegiatan Keluarga Ketowan",
      owner_id: user.id,
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (insertError || !createdProject) {
    throw new Error(
      `Gagal membuat proyek: ${
        insertError?.message ??
        "Data proyek tidak dikembalikan."
      }`,
    );
  }

  return {
    ...(createdProject as ProjectRow),
    role: "owner",
  };
}