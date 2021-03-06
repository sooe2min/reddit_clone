import DataLoader from 'dataloader'
import { Updoot } from '../entities/Updoot'

export const createUpdootLoader = () =>
	new DataLoader<{ userId: number; postId: number }, Updoot | null>(
		async keys => {
			// findByIds는 PrimaryColumn을 따른다.
			const updoots = await Updoot.findByIds(keys as any)

			const updootIdsToUpdoot: Record<string, Updoot> = {}
			updoots.forEach(updoot => {
				updootIdsToUpdoot[`${updoot.userId} | ${updoot.postId}`] = updoot
			})

			return keys.map(
				key => updootIdsToUpdoot[`${key.userId} | ${key.postId}`]
			)
		}
	)
