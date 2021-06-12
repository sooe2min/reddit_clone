import React, { useState } from 'react'
import { Wrapper } from '../components/Wrapper'
import { useLoginMutation } from '../generated/graphql'
import { toErrorMap } from '../utils/toErrorMap'
import { useRouter } from 'next/router'
import { createUrqlClient } from '../utils/createUqrlCleint'
import { withUrqlClient } from 'next-urql'

interface loginProps {}

const Login: React.FC<loginProps> = ({}) => {
	const [usernameOrEmail, setUsernameOrEmail] = useState('')
	const [password, setPassword] = useState('')
	const [errors, setErros] = useState<Record<string, string>>({})

	const [_, login] = useLoginMutation()
	const router = useRouter()

	return (
		<Wrapper variant="small">
			<form
				className="flex flex-col"
				onSubmit={async e => {
					e.preventDefault()

					const response = await login({
						password: password,
						usernameOrEmail: usernameOrEmail
					})

					if (response.data?.login.errors) {
						setErros(toErrorMap(response.data.login.errors))
					} else if (response.data?.login.user) {
						router.push('/')
					}
				}}>
				<div className="mt-3">
					<label
						className="font-semibold text-xl"
						htmlFor="usernameOrEmail">
						Username or Email
					</label>
					<input
						className="w-full border mt-2 border-green-500 p-3"
						id="usernameOrEmail"
						type="text"
						placeholder="username or email"
						value={usernameOrEmail || ''}
						onChange={e => setUsernameOrEmail(e.target.value)}
					/>
					{errors.usernameOrEmail && (
						<p className="text-red-600 mt-1 font-light">
							{errors.usernameOrEmail}
						</p>
					)}
				</div>
				<div className="mt-3">
					<label className="font-semibold text-xl" htmlFor="password">
						Password
					</label>
					<input
						className="w-full border mt-2 border-green-500 p-3"
						id="password"
						type="password"
						autoComplete="false"
						placeholder="password"
						value={password || ''}
						onChange={e => setPassword(e.target.value)}
					/>
					{errors.password && (
						<p className="text-red-600 mt-1 font-light">
							{errors.password}
						</p>
					)}
				</div>
				<button
					className="font-semibold mt-3 rounded-lg p-4 bg-green-500 text-white w-1/3"
					type="submit">
					login
				</button>
			</form>
		</Wrapper>
	)
}

export default withUrqlClient(createUrqlClient)(Login)
