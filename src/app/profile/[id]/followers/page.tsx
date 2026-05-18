import ProfileSocialListPage from "@/components/profile-social-list-page";

type FollowersRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function ProfileFollowersRoute({ params }: FollowersRouteProps) {
  const { id } = await params;
  return <ProfileSocialListPage userId={id} mode="followers" />;
}
