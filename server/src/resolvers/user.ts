import { User } from '../entities/User'
import { MyContext } from 'src/types'
import {
	Mutation,
	Arg,
	Ctx,
	Resolver,
	Field,
	ObjectType,
	Query,
	FieldResolver,
	Root
} from 'type-graphql'
import argon2 from 'argon2'
import { COOKIE_NAME, FORGET_PASSWORD_PREFIX } from '../constants'
import { validateRegister } from '../utils/validateRegister'
import { UsernamePasswordInput } from './UsernamePasswordInput'
import { v4 } from 'uuid'
import { sendEmail } from '../utils/sendEmail'
import { getConnection } from 'typeorm'

@ObjectType()
class FieldError {
	@Field()
	field: string
	@Field()
	message: string
}

@ObjectType()
class UserResponse {
	@Field(() => [FieldError], { nullable: true })
	errors?: FieldError[]
	@Field(() => User, { nullable: true })
	user?: User
}

@Resolver(User)
export class UserResolver {
	@FieldResolver(() => String)
	email(@Root() user: User, @Ctx() { req }: MyContext) {
		if (req.session.userId === user.id) {
			return user.email
		}
		return ''
	}

	@Query(() => User, { nullable: true })
	me(@Ctx() { req }: MyContext) {
		// you are not logged in
		if (!req.session.userId) {
			return null
		}
		return User.findOne(req.session.userId)
	}

	@Mutation(() => UserResponse)
	async register(
		@Arg('options') options: UsernamePasswordInput,
		@Ctx() { req }: MyContext
	): Promise<UserResponse> {
		const errors = validateRegister(options)
		if (errors) {
			return { errors }
		}

		const hashedPassword = await argon2.hash(options.password)
		let user

		try {
			const result = await getConnection()
				.createQueryBuilder()
				.insert()
				.into(User)
				.values({
					email: options.email,
					username: options.username,
					password: hashedPassword
				})
				.returning('*')
				.execute()

			user = result.raw[0]
		} catch (err) {
			// duplicate username error
			// || err.detail.includes('already exists')
			if (err.code === '23505' && err.detail.includes('username')) {
				return {
					errors: [
						{
							field: 'username',
							message: 'username already taken'
						}
					]
				}
			} else {
				return {
					errors: [
						{
							field: 'email',
							message: 'email already taken'
						}
					]
				}
			}
		}

		// store user id session
		// this will set a cookie on the user
		// keep them logeed in
		req.session.userId = user.id
		return { user }
	}

	@Mutation(() => UserResponse)
	async login(
		@Arg('usernameOrEmail') usernameOrEmail: string,
		@Arg('password') password: string,
		@Ctx() { req }: MyContext
	): Promise<UserResponse> {
		const user = await User.findOne(
			usernameOrEmail.includes('@')
				? { email: usernameOrEmail }
				: { username: usernameOrEmail }
		)

		if (!user) {
			return {
				errors: [
					{
						field: 'usernameOrEmail',
						message: "that username or email doesn't exist"
					}
				]
			}
		}

		const valid = await argon2.verify(user.password, password)
		if (!valid) {
			return {
				errors: [
					{
						field: 'password',
						message: 'incorrect password'
					}
				]
			}
		}

		req.session.userId = user.id
		return { user }
	}

	@Mutation(() => Boolean)
	logout(@Ctx() { req, res }: MyContext) {
		return new Promise(resolve => {
			res.clearCookie(COOKIE_NAME)
			req.session.destroy(err => {
				if (err) {
					resolve(false)
					return
				} else resolve(true)
			})
		})
	}

	@Mutation(() => Boolean)
	async forgotPassword(
		@Arg('email') email: string,
		@Ctx() { redis }: MyContext
	) {
		const user = await User.findOne({ email })
		if (!user) {
			// the email is not in the db
			return false
		}

		const token = v4()
		redis.set(
			FORGET_PASSWORD_PREFIX + token,
			user.id,
			'ex',
			1000 * 60 * 60 * 24 * 3
		)

		await sendEmail(
			email,
			`<a href="http://localhost:3000/change-password/${token}">reset password</a>`
		)

		return true
	}

	@Mutation(() => UserResponse)
	async changePassword(
		@Arg('token') token: string,
		@Arg('newPassword') newPassword: string,
		@Ctx() { req, redis }: MyContext
	) {
		if (newPassword.length <= 3) {
			return {
				errors: [
					{
						field: 'newPassword',
						message: 'length must be greater than 3'
					}
				]
			}
		}

		const key = FORGET_PASSWORD_PREFIX + token
		const userId = await redis.get(key)

		if (!userId) {
			return {
				errors: [
					{
						field: 'token',
						message: 'token expired'
					}
				]
			}
		}

		const user = await User.findOne(parseInt(userId))
		if (!user) {
			return {
				errors: [
					{
						field: 'token',
						message: 'user no longer exists'
					}
				]
			}
		}

		User.update(userId, { password: await argon2.hash(newPassword) })
		await redis.del(key)

		// log in user after change password
		req.session.userId = user.id

		return { user }
	}
}
