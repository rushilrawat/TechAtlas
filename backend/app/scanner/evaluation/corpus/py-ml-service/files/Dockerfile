FROM python:3.12-slim
COPY . /app
RUN pip install .
CMD ["uvicorn", "service.api:app"]
