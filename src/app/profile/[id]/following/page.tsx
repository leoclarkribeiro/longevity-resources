import ProfileSocialListPage from "@/components/profile-social-list-page";

type FollowingRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function ProfileFollowingRoute({ params }: FollowingRouteProps) {
  const { id } = await params;
  return <ProfileSocialListPage userId={id} mode="following" />;
}
