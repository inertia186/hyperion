import { imageProxy } from '../format'

export default function CommunityLabel({name, imageUrl, className = ''}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      {imageUrl && <img data-testid="community-profile-image" className="h-4 w-4 flex-none rounded-full object-cover" src={imageProxy(imageUrl, '0x32')} alt="" />}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}
