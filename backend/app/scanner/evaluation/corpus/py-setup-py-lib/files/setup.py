from setuptools import setup, find_packages

install_requires = [
    "numpy>=1.24",
    "requests",
]

setup(
    name="demo-lib",
    description="A small library that does things",
    python_requires=">=3.9",
    packages=find_packages(),
    install_requires=install_requires,
    extras_require={
        "torch": ["torch>=2.2"],
        "test": ["pytest>=8", "pytest-cov"],
    },
    classifiers=["Programming Language :: Python :: 3"],
)
