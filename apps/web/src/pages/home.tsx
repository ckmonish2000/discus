import { Link } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Welcome to Discus</h1>
      <p className="text-muted-foreground">
        A simple storage management interface.
      </p>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Storage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Manage buckets, upload files, and generate presigned URLs.
          </p>
          <Link to="/storage">
            <Button>Go to Storage</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
