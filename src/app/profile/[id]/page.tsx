import ProfilePage from "@/components/profile-page";

type ProfileRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function UserProfileRoute({ params }: ProfileRouteProps) {
  const { id } = await params;
  return <ProfilePage userId={id} />;
}
