import { Post } from '../entities/Post'
import {
	Query,
	Arg,
	Mutation,
	Resolver,
	Field,
	InputType,
	Ctx,
	Authorized,
	Int,
	FieldResolver,
	Root,
	ObjectType
} from 'type-graphql'
import { MyContext } from 'src/types'
import { User } from '../entities/User'
import { getConnection } from 'typeorm'
import { Updoot } from '../entities/Updoot'

@ObjectType()
class PaginatedPosts {
	@Field(() => [Post])
	posts: Post[]
	@Field()
	hasMore: boolean
}

@InputType()
class PostInput {
	@Field()
	title: string
	@Field()
	text: string
}

@Resolver(Post)
export class PostResolver {
	@FieldResolver(() => String)
	textSnippet(@Root() root: Post) {
		return root.text.slice(0, 500)
	}

	@FieldResolver(() => User)
	creator(@Root() post: Post, @Ctx() { userLoader }: MyContext) {
		return userLoader.load(post.creatorId)
	}

	@FieldResolver(() => Int, { nullable: true })
	async voteStatus(
		@Root() post: Post,
		@Ctx() { req, updootLoader }: MyContext
	) {
		if (!req.session.userId) {
			return null
		}

		const updoot = await updootLoader.load({
			userId: req.session.userId,
			postId: post.id
		})

		return updoot ? updoot.value : null
	}

	@Query(() => PaginatedPosts)
	async posts(
		@Arg('limit', () => Int) limit: number,
		@Arg('cursor', () => String, { nullable: true }) cursor: string | null
	): Promise<PaginatedPosts> {
		const realLimit = Math.min(limit, 50)
		const realLimitPlusOne = realLimit + 1

		const qb = getConnection()
			.getRepository(Post)
			.createQueryBuilder('p')
			.orderBy('p.createdAt', 'DESC')
			.take(realLimitPlusOne)

		if (cursor) {
			// 내림차순, cursor 값보다 작은 createdAt
			qb.where('p.createdAt < :cursor', {
				cursor: new Date(parseInt(cursor))
			})
		}
		const posts = await qb.getMany()

		return {
			posts: posts.slice(0, realLimit),
			hasMore: posts.length === realLimitPlusOne
		}
	}

	@Query(() => Post, { nullable: true })
	post(@Arg('id', () => Int) id: number): Promise<Post | undefined> {
		return Post.findOne(id)
	}

	@Authorized()
	@Mutation(() => Post)
	async createPost(
		@Arg('input') input: PostInput,
		@Ctx() { req }: MyContext
	): Promise<Post> {
		return Post.create({
			...input,
			creator: await User.findOne({ where: { id: req.session.userId } })
		}).save()
	}

	@Authorized()
	@Mutation(() => Post, { nullable: true })
	async updatePost(
		@Arg('id', () => Int) id: number,
		@Arg('input') input: PostInput,
		@Ctx() { req }: MyContext
	) {
		const post = await Post.findOne(id)
		if (!post) return null
		if (post.creatorId !== req.session.userId)
			throw new Error('not authorized')
		post.title = input.title
		post.text = input.text
		await post.save()
		return post
	}

	@Authorized()
	@Mutation(() => Boolean)
	async deletePost(
		@Arg('id', () => Int) id: number,
		@Ctx() { req }: MyContext
	): Promise<boolean> {
		const post = await Post.findOne(id)
		if (!post) return false
		if (post.creatorId !== req.session.userId)
			throw new Error('not authorized')

		await Updoot.delete({ postId: id })
		await Post.delete({ id })
		return true
	}

	@Mutation(() => Boolean)
	async vote(
		@Arg('postId', () => Int) postId: number,
		@Arg('value', () => Int) value: number,
		@Ctx() { req }: MyContext
	) {
		const isUpdoot = value !== -1
		const realValue = isUpdoot ? 1 : -1
		const { userId } = req.session

		const updoot = await Updoot.findOne({ where: { userId, postId } })

		if (updoot && updoot.value !== realValue) {
			updoot.value = realValue
			updoot.save()

			const post = await Post.findOne(postId)
			post!.points = post!.points + realValue * 2
			post?.save()
		} else if (!updoot) {
			await Updoot.insert({
				value: realValue,
				userId: userId,
				postId: postId
			})

			const post = await Post.findOne(postId)
			post!.points = post!.points + realValue
			post?.save()
		}
		return true
	}
}
